// Cloudflare Pages Function for /api/timestamp (only if hosting on Cloudflare Pages
// instead of the Docker/Node server). Same handler as server/node.ts.
// In-memory limits here apply per Worker instance, so also add a Cloudflare
// rate-limiting rule for /api/timestamp in the dashboard.

import { createTimestampHandler } from '../../server/timestamp.ts'
import { defaultLimiter } from '../../server/rate-limit.ts'

const handler = createTimestampHandler({ limiter: defaultLimiter() })

export const onRequest = (context: { request: Request }): Promise<Response> =>
  handler(context.request, context.request.headers.get('CF-Connecting-IP') ?? undefined)
