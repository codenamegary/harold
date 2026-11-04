import { DemoStore } from "./demo.state"
import { RateLimitRule } from "./demo.rate.limit"

export type DemoAppOptions = {
  now?: () => number
  reaperIntervalMs?: number
  turnDelayMs?: number
  randomInt?: (minInclusive: number, maxExclusive: number) => number
  interactionTimeoutMs?: number
  heartbeatMs?: number
  maxDevices?: number
  maxSessionsPerDevice?: number
  claimRateLimit?: RateLimitRule
  promptRateLimit?: RateLimitRule
  sseRateLimit?: RateLimitRule
}

export type DemoRouteContext = {
  store: DemoStore
  request: Request
  url: URL
  deviceId: string
  options: DemoAppOptions
}

export const pathSegments = (pathname: string): ReadonlyArray<string> =>
  pathname.split("/").filter((segment) => segment.length > 0)

export const queryValue = (url: URL, name: string): string | undefined => {
  const value = url.searchParams.get(name)
  return value === null || value.length === 0 ? undefined : value
}
