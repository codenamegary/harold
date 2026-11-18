import { describe, expect, test } from "bun:test"
import { createDemoHostStore } from "./host.store"

const fixedNow = (iso: string) => () => new Date(iso)

const lines = (output: string): Array<Array<string>> =>
  output
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"))

describe("host.store", () => {
  test("seeds prior runs for every known agent without an active run", () => {
    const store = createDemoHostStore()
    const rows = lines(store.logs())

    expect(rows.length).toBe(6)
    expect(rows.every((row) => row[0] === "run")).toBe(true)
    expect(rows.every((row) => row[5] === "0" && row[6] === "0")).toBe(true)
    expect(new Set(rows.map((row) => row[1]))).toEqual(
      new Set(["opencode", "cursor", "claude-acp", "codex-acp", "gemini"]),
    )
  })

  test("a first connect creates one active run and reconnects reuse it", () => {
    const store = createDemoHostStore({ now: fixedNow("2026-11-17T14:25:30Z") })

    const first = store.connect("opencode")
    expect(first?.created).toBe(true)
    expect(first?.runId).toBe("20261117T142530Z-000007")

    const second = store.connect("opencode")
    expect(second).toEqual({ runId: first?.runId ?? "", created: false })

    const active = lines(store.logs()).filter(
      (row) => row[1] === "opencode" && row[5] === "1",
    )
    expect(active).toHaveLength(1)
    expect(active[0]?.[2]).toBe(first?.runId)
    expect(active[0]?.[6]).toBe("1")
  })

  test("stop then connect creates a new run and keeps the previous one", () => {
    const store = createDemoHostStore({ now: fixedNow("2026-11-17T14:25:30Z") })
    const first = store.connect("cursor")
    store.stop("cursor")
    const stopped = lines(store.logs()).find((row) => row[2] === first?.runId)
    expect(stopped?.[5]).toBe("1")
    expect(stopped?.[6]).toBe("0")

    const second = store.connect("cursor")
    expect(second?.created).toBe(true)
    expect(second?.runId).not.toBe(first?.runId)

    const runs = lines(store.logs()).filter((row) => row[1] === "cursor")
    expect(runs.some((row) => row[2] === first?.runId)).toBe(true)
    expect(runs.some((row) => row[2] === second?.runId && row[5] === "1")).toBe(true)
  })

  test("recordOut grows only the active run", () => {
    const store = createDemoHostStore({ now: fixedNow("2026-11-17T14:25:30Z") })
    const run = store.connect("opencode")
    store.recordOut("opencode", 120)
    store.recordOut("opencode", 30)

    const active = lines(store.logs()).find((row) => row[2] === run?.runId)
    expect(active?.[3]).toBe("150")
  })

  test("cleanup deletes whole inactive runs and protects active and newest", () => {
    const store = createDemoHostStore({ now: fixedNow("2026-11-17T14:25:30Z") })
    const run = store.connect("opencode")
    const before = lines(store.logs())
    const activeRow = before.find((row) => row[2] === run?.runId)
    expect(activeRow).toBeDefined()

    const result = store.cleanup("all-inactive")
    expect(result?.deletedRuns).toBeGreaterThan(0)
    expect(result?.removedBytes).toBeGreaterThan(0)

    const after = lines(store.logs())
    expect(after.some((row) => row[2] === run?.runId && row[5] === "1")).toBe(true)
    const byAgent = new Map<string, number>()
    for (const row of after) {
      byAgent.set(row[1] ?? "", (byAgent.get(row[1] ?? "") ?? 0) + 1)
    }
    expect(Array.from(byAgent.values()).every((count) => count <= 2)).toBe(true)
  })

  test("the warning seed is a counter, not a 600 MB buffer", () => {
    const store = createDemoHostStore({ seedWarningRun: true })
    const warning = lines(store.logs()).find((row) => row[1] === "opencode" && row[3] === "629145600")
    expect(warning).toBeDefined()

    const result = store.cleanup("all-inactive")
    expect(result?.deletedRuns).toBeGreaterThan(0)
    const after = lines(store.logs())
    expect(after.some((row) => row[3] === "629145600")).toBe(false)
  })

  test("unknown policies and agents are rejected without state", () => {
    const store = createDemoHostStore()
    expect(store.cleanup("everything")).toBeNull()
    expect(store.connect("not-an-agent")).toBeNull()
    store.stop("not-an-agent")
    store.recordOut("not-an-agent", 10)
  })

  test("seeded usage is available without a live session", () => {
    const store = createDemoHostStore()
    const rows = lines(store.usage("opencode", false))

    const usage = rows.filter((row) => row[0] === "usage")
    expect(usage.length).toBeGreaterThan(0)
    expect(usage[0]?.[1]).toBe("opencode")
    expect(usage[0]?.[4]).toContain("ses_demo_opencode_0001")
    expect(usage[0]?.[4]).toContain('"usage_update"')
    expect(rows.some((row) => row[0] === "done" && row[1] === "opencode")).toBe(true)
  })

  test("recorded usage is returned by an incremental latest scan", () => {
    const store = createDemoHostStore({ now: fixedNow("2026-11-17T14:25:30Z") })
    const run = store.connect("opencode")
    expect(run).not.toBeNull()

    store.recordUsage("opencode", "ses_new", {
      sessionId: "ses_new",
      used: 12,
      size: 1_000,
      cost: { amount: 0.01, currency: "USD" },
    })

    const rows = lines(store.usage("opencode", true, run?.runId, 0))
    const usage = rows.find(
      (row) => row[0] === "usage" && row[4]?.includes("ses_new"),
    )
    expect(usage).toBeDefined()
    expect(usage?.[2]).toBe(run?.runId)
    expect(rows.some((row) => row[0] === "end" && row[2] === run?.runId)).toBe(true)
  })

  test("run history is capped and never drops the active run", () => {
    const store = createDemoHostStore({
      now: fixedNow("2026-11-17T14:25:30Z"),
      maxRunsPerAgent: 2,
    })
    store.connect("gemini")
    const firstId = lines(store.logs()).find((row) => row[1] === "gemini" && row[5] === "1")?.[2]
    store.stop("gemini")
    store.connect("gemini")
    const secondId = lines(store.logs()).find((row) => row[1] === "gemini" && row[5] === "1")?.[2]
    store.stop("gemini")
    store.connect("gemini")
    const thirdId = lines(store.logs()).find((row) => row[1] === "gemini" && row[5] === "1")?.[2]

    const rows = lines(store.logs()).filter((row) => row[1] === "gemini")
    expect(rows.length).toBeLessThanOrEqual(2)
    expect(rows.some((row) => row[2] === thirdId)).toBe(true)
    expect(rows.some((row) => row[2] === firstId)).toBe(false)
    expect(rows.some((row) => row[2] === secondId)).toBe(true)
  })
})
