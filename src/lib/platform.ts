// Pure browser detection, kept out of the UI so it can be unit-tested.

export type InstallPlatform = 'ios' | 'android' | 'mac-safari' | 'firefox' | 'desktop'

/** Which install instructions fit this browser. Exported for tests. */
export function installPlatform(ua: string, platform: string, maxTouchPoints: number): InstallPlatform {
  if (/iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  if (/Firefox\//.test(ua)) return 'firefox'
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\/|OPR\//.test(ua)) return 'mac-safari'
  return 'desktop'
}
