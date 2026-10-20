import { describe, expect, test } from "bun:test"
import { createConfigOptionsCache } from "./config.cache"

const config = [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select" as const,
    currentValue: "m1",
    options: [{ value: "m1", name: "M1" }],
  },
]

const otherConfig = [
  {
    id: "mode",
    name: "Mode",
    category: "mode",
    type: "select" as const,
    currentValue: "build",
    options: [{ value: "build", name: "Build" }],
  },
]

describe("config options cache", () => {
  test("restores an initial snapshot and reports every change", () => {
    const snapshots: Array<Record<string, unknown>> = []
    const cache = createConfigOptionsCache({
      initial: { "cursor:s1": config },
      onChange: (snapshot) => {
        snapshots.push(snapshot)
      },
    })

    expect(cache.get({ agentId: "cursor", sessionId: "s1" })).toEqual(config)

    cache.remember({ agentId: "cursor", sessionId: "s2", configOptions: otherConfig })
    expect(cache.get({ agentId: "cursor", sessionId: "s2" })).toEqual(otherConfig)
    expect(snapshots).toEqual([
      {
        "cursor:s1": config,
        "cursor:s2": otherConfig,
      },
    ])

    cache.forget({ agentId: "cursor", sessionId: "s1" })
    expect(cache.get({ agentId: "cursor", sessionId: "s1" })).toBeUndefined()
    expect(snapshots.at(-1)).toEqual({ "cursor:s2": otherConfig })

    cache.forget({ agentId: "cursor", sessionId: "missing" })
    expect(snapshots).toHaveLength(2)
  })
})
