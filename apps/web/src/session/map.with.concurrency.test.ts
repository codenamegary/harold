import { describe, expect, test } from "bun:test"
import { mapWithConcurrency } from "./map.with.concurrency"

describe("mapWithConcurrency", () => {
  test("keeps input order and respects concurrency", async () => {
    const active = { count: 0, max: 0 }
    const settled: number[] = []

    const results = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active.count += 1
      active.max = Math.max(active.max, active.count)
      await new Promise((resolve) => setTimeout(resolve, 20))
      active.count -= 1
      settled.push(value)
      return value * 10
    })

    expect(results).toEqual([10, 20, 30, 40, 50])
    expect(settled).toEqual([1, 2, 3, 4, 5])
    expect(active.max).toBeLessThanOrEqual(2)
    expect(active.count).toBe(0)
  })

  test("returns empty array for empty input", async () => {
    const results = await mapWithConcurrency([], 3, async (value: number) => value)
    expect(results).toEqual([])
  })
})
