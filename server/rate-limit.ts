// In-memory token buckets: one per client, plus one shared bucket that caps the
// total we send to the free timestamp authority. Enough for a single server
// process; nothing is stored beyond a counter per recent IP address.

export interface BucketConfig {
  /** Most requests allowed in a burst. */
  capacity: number
  /** Tokens added back per second. */
  refillPerSecond: number
}

interface Bucket {
  tokens: number
  updated: number
}

export class RateLimiter {
  private perClient: BucketConfig
  private global: BucketConfig
  private clients = new Map<string, Bucket>()
  private shared: Bucket
  private now: () => number

  constructor(perClient: BucketConfig, global: BucketConfig, now: () => number = Date.now) {
    this.perClient = perClient
    this.global = global
    this.now = now
    this.shared = { tokens: global.capacity, updated: now() }
  }

  private refill(b: Bucket, cfg: BucketConfig, t: number) {
    b.tokens = Math.min(cfg.capacity, b.tokens + ((t - b.updated) / 1000) * cfg.refillPerSecond)
    b.updated = t
  }

  /** Returns 0 if allowed (and takes a token), else the seconds to wait. */
  take(client: string): number {
    const t = this.now()
    if (this.clients.size > 50_000) this.prune(t)
    let b = this.clients.get(client)
    if (!b) {
      b = { tokens: this.perClient.capacity, updated: t }
      this.clients.set(client, b)
    }
    this.refill(b, this.perClient, t)
    this.refill(this.shared, this.global, t)
    if (b.tokens < 1) return Math.ceil((1 - b.tokens) / this.perClient.refillPerSecond)
    if (this.shared.tokens < 1) return Math.ceil((1 - this.shared.tokens) / this.global.refillPerSecond)
    b.tokens -= 1
    this.shared.tokens -= 1
    return 0
  }

  /** Forget clients whose bucket has refilled completely. */
  private prune(t: number) {
    const full = (this.perClient.capacity / this.perClient.refillPerSecond) * 1000
    for (const [k, b] of this.clients) if (t - b.updated > full) this.clients.delete(k)
  }
}

/** A move-in can be 100+ photos in a few minutes, so allow bursts but cap the steady rate. */
export function defaultLimiter(): RateLimiter {
  return new RateLimiter({ capacity: 120, refillPerSecond: 1 }, { capacity: 600, refillPerSecond: 10 })
}
