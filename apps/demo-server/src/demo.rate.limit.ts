export type RateLimitRule = {
  limit: number
  windowMs: number
}

type Counter = {
  count: number
  resetAt: number
}

export type RateLimiter = {
  allow: (key: string) => boolean
}

export const createRateLimiter = (
  rule: RateLimitRule,
  now: () => number = () => Date.now(),
): RateLimiter => {
  const counters = new Map<string, Counter>()

  return {
    allow: (key: string): boolean => {
      const nowMs = now()
      const existing = counters.get(key)
      if (existing === undefined || existing.resetAt <= nowMs) {
        counters.set(key, { count: 1, resetAt: nowMs + rule.windowMs })
        if (counters.size > 5_000) {
          for (const [candidate, counter] of counters) {
            if (counter.resetAt <= nowMs) {
              counters.delete(candidate)
            }
          }
        }
        return true
      }
      if (existing.count >= rule.limit) {
        return false
      }
      existing.count += 1
      return true
    },
  }
}
