import { AGENT_BINARIES } from "./seed.data"

/**
 * Demo host state. A real Harold host keeps one directory per host process
 * and streams agent output into it. The demo keeps only byte counters and run
 * ids in memory: enough for the app's `logs` and `cleanup` commands, with no
 * log content, no file handles, and no disk reads.
 */
export type DemoLogRun = {
  id: string
  outBytes: number
  errBytes: number
}

export type DemoUsage = {
  sessionId: string
  used: number
  size: number
  cost?: { amount: number; currency: string }
}

type DemoUsageRecord = DemoUsage & {
  runId: string
  offset: number
}

type AgentHostState = {
  agentId: string
  running: boolean
  activeRunId: string | null
  runs: Array<DemoLogRun>
  usage: Array<DemoUsageRecord>
  nextUsageOffset: number
}

export type DemoHostStoreOptions = {
  seedWarningRun?: boolean
  maxRunsPerAgent?: number
  now?: () => Date
}

export type DemoHostConnect = {
  runId: string
  created: boolean
}

export type DemoHostCleanup = {
  deletedRuns: number
  removedBytes: number
}

export type DemoHostStore = {
  connect: (agentId: string) => DemoHostConnect | null
  stop: (agentId: string) => void
  recordOut: (agentId: string, bytes: number) => void
  recordUsage: (agentId: string, sessionId: string, usage: DemoUsage) => void
  logs: () => string
  usage: (agentId: string, latest: boolean, knownRunId?: string, knownOffset?: number) => string
  cleanup: (policy: string) => DemoHostCleanup | null
}

const DEFAULT_MAX_RUNS_PER_AGENT = 32
const WARNING_RUN_BYTES = 600 * 1024 * 1024

const SEEDED_RUNS: Record<string, ReadonlyArray<DemoLogRun>> = {
  opencode: [
    { id: "20261109T221500Z-000001", outBytes: 118_000, errBytes: 0 },
    { id: "20261110T113000Z-000002", outBytes: 42_000, errBytes: 0 },
  ],
  cursor: [{ id: "20261109T223000Z-000003", outBytes: 73_000, errBytes: 0 }],
  "claude-acp": [{ id: "20261109T211000Z-000004", outBytes: 31_000, errBytes: 0 }],
  "codex-acp": [{ id: "20261108T180000Z-000005", outBytes: 12_000, errBytes: 0 }],
  gemini: [{ id: "20261108T170000Z-000006", outBytes: 8_000, errBytes: 0 }],
}

const SEEDED_USAGE: Record<string, ReadonlyArray<DemoUsage>> = {
  opencode: [
    {
      sessionId: "ses_demo_opencode_0001",
      used: 38_400,
      size: 1_000_000,
      cost: { amount: 0.009, currency: "USD" },
    },
  ],
}

const WARNING_SEED: ReadonlyArray<DemoLogRun> = [
  { id: "20261111T120000Z-000007", outBytes: WARNING_RUN_BYTES, errBytes: 0 },
  // The newest run is protected by cleanup. Keep a small one after the large
  // run so the warning run itself can be removed in the demo.
  { id: "20261112T120000Z-000008", outBytes: 1_500, errBytes: 0 },
]

const compactUtc = (date: Date): string =>
  `${date.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`

const runNumber = (runId: string): number => {
  const suffix = runId.slice(runId.lastIndexOf("-") + 1)
  const value = Number(suffix)
  return Number.isSafeInteger(value) ? value : 0
}

const runBytes = (run: DemoLogRun): number => run.outBytes + run.errBytes

const usageLine = (agentId: string, record: DemoUsageRecord): string => {
  const update: Record<string, unknown> = {
    sessionUpdate: "usage_update",
    used: record.used,
    size: record.size,
  }
  if (record.cost) {
    update.cost = record.cost
  }
  const json = JSON.stringify({
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId: record.sessionId, update },
  })
  return `usage\t${agentId}\t${record.runId}\t${record.offset}\t${json}`
}

/** Reads one ACP notification and returns its usage update, if it has one. */
export const parseUsageMessage = (
  message: unknown,
): { sessionId: string; usage: DemoUsage } | null => {
  if (!message || typeof message !== "object") {
    return null
  }
  const root = message as Record<string, unknown>
  if (root.method !== "session/update") {
    return null
  }
  const params = root.params as Record<string, unknown> | undefined
  const update = params?.update as Record<string, unknown> | undefined
  if (!params || !update || update.sessionUpdate !== "usage_update") {
    return null
  }
  const sessionId = typeof params.sessionId === "string" ? params.sessionId : ""
  const used = typeof update.used === "number" ? update.used : null
  const size = typeof update.size === "number" ? update.size : null
  if (!sessionId || used === null || size === null) {
    return null
  }
  const rawCost = update.cost as Record<string, unknown> | undefined
  const amount = typeof rawCost?.amount === "number" ? rawCost.amount : null
  const currency = typeof rawCost?.currency === "string" ? rawCost.currency : null
  return {
    sessionId,
    usage: {
      sessionId,
      used,
      size,
      ...(amount !== null && currency !== null
        ? { cost: { amount, currency } }
        : {}),
    },
  }
}

const newestRunId = (runs: ReadonlyArray<DemoLogRun>): string | null => {
  let newest: string | null = null
  for (const run of runs) {
    if (newest === null || run.id > newest) {
      newest = run.id
    }
  }
  return newest
}

const seedRuns = (seedWarningRun: boolean): Map<string, AgentHostState> => {
  const states = new Map<string, AgentHostState>()
  for (const agentId of Object.keys(AGENT_BINARIES)) {
    const seeded = [...(SEEDED_RUNS[agentId] ?? [])]
    if (agentId === "opencode" && seedWarningRun) {
      seeded.push(...WARNING_SEED)
    }
    const runs = seeded.map((run) => ({ ...run }))
    const newest = newestRunId(runs)
    const usage = (SEEDED_USAGE[agentId] ?? []).map((record, index) => ({
      ...record,
      runId: newest ?? "seed",
      offset: index + 1,
    }))
    states.set(agentId, {
      agentId,
      running: false,
      activeRunId: null,
      runs,
      usage,
      nextUsageOffset: usage.length + 1,
    })
  }
  return states
}

export const createDemoHostStore = (
  options: DemoHostStoreOptions = {},
): DemoHostStore => {
  const states = seedRuns(options.seedWarningRun ?? false)
  const maxRunsPerAgent = Math.max(2, options.maxRunsPerAgent ?? DEFAULT_MAX_RUNS_PER_AGENT)
  const now = options.now ?? (() => new Date())
  const state = {
    nextRunNumber:
      Math.max(
        0,
        ...Array.from(states.values()).flatMap((host) =>
          host.runs.map((run) => runNumber(run.id)),
        ),
      ) + 1,
  }

  const nextRunId = (): string => {
    const number = String(state.nextRunNumber).padStart(6, "0")
    state.nextRunNumber += 1
    return `${compactUtc(now())}-${number}`
  }

  const trimRuns = (host: AgentHostState, keepId: string): void => {
    while (host.runs.length > maxRunsPerAgent) {
      const newest = newestRunId(host.runs)
      const index = host.runs.findIndex(
        (run) => run.id !== keepId && run.id !== host.activeRunId && run.id !== newest,
      )
      if (index < 0) {
        return
      }
      host.runs.splice(index, 1)
    }
  }

  const connect = (agentId: string): DemoHostConnect | null => {
    const host = states.get(agentId)
    if (!host) {
      return null
    }
    if (host.running && host.activeRunId !== null) {
      return { runId: host.activeRunId, created: false }
    }
    const runId = nextRunId()
    host.runs.push({ id: runId, outBytes: 0, errBytes: 0 })
    host.activeRunId = runId
    host.running = true
    trimRuns(host, runId)
    return { runId, created: true }
  }

  const stop = (agentId: string): void => {
    const host = states.get(agentId)
    if (host) {
      host.running = false
    }
  }

  const recordOut = (agentId: string, bytes: number): void => {
    const host = states.get(agentId)
    if (!host || !Number.isFinite(bytes) || bytes <= 0) {
      return
    }
    const run = host.runs.find((candidate) => candidate.id === host.activeRunId)
    if (run) {
      run.outBytes += Math.floor(bytes)
    }
  }

  const recordUsage = (agentId: string, sessionId: string, usage: DemoUsage): void => {
    const host = states.get(agentId)
    if (!host || !sessionId || !host.activeRunId) {
      return
    }
    host.usage.push({
      ...usage,
      sessionId,
      runId: host.activeRunId,
      offset: host.nextUsageOffset,
    })
    host.nextUsageOffset += 1
  }

  const maxUsageOffset = (host: AgentHostState, runId: string): number =>
    host.usage.reduce(
      (highest, record) =>
        record.runId === runId ? Math.max(highest, record.offset) : highest,
      0,
    )

  const usage = (
    agentId: string,
    latest: boolean,
    knownRunId?: string,
    knownOffset?: number,
  ): string => {
    const host = states.get(agentId)
    if (!host) {
      return ""
    }
    const runIds = latest
      ? [newestRunId(host.runs)].filter((runId): runId is string => runId !== null)
      : host.runs.map((run) => run.id).sort()
    if (runIds.length === 0) {
      return latest ? "" : `done\t${agentId}\n`
    }

    const lines: Array<string> = []
    for (const runId of runIds) {
      const start = latest && knownRunId === runId ? Math.max(0, knownOffset ?? 0) : 0
      const records = host.usage
        .filter((record) => record.runId === runId && record.offset > start)
        .sort((left, right) => left.offset - right.offset)
      for (const record of records) {
        lines.push(usageLine(agentId, record))
      }
      const end = latest
        ? Math.max(start, maxUsageOffset(host, runId))
        : maxUsageOffset(host, runId)
      lines.push(`end\t${agentId}\t${runId}\t${end}`)
    }
    if (!latest) {
      lines.push(`done\t${agentId}`)
    }
    return `${lines.join("\n")}\n`
  }

  const logs = (): string => {
    const lines: Array<string> = []
    for (const host of states.values()) {
      if (host.runs.length === 0) {
        continue
      }
      const running = host.running ? 1 : 0
      for (const run of host.runs) {
        const active = run.id === host.activeRunId ? 1 : 0
        lines.push(
          `run\t${host.agentId}\t${run.id}\t${run.outBytes}\t${run.errBytes}\t${active}\t${running}`,
        )
      }
    }
    return lines.length > 0 ? `${lines.join("\n")}\n` : ""
  }

  const cleanup = (policy: string): DemoHostCleanup | null => {
    if (policy !== "all-inactive") {
      return null
    }
    const result: DemoHostCleanup = { deletedRuns: 0, removedBytes: 0 }
    for (const host of states.values()) {
      const newest = newestRunId(host.runs)
      host.runs = host.runs.filter((run) => {
        if (run.id === host.activeRunId || run.id === newest) {
          return true
        }
        result.deletedRuns += 1
        result.removedBytes += runBytes(run)
        return false
      })
    }
    return result
  }

  return { connect, stop, recordOut, recordUsage, logs, usage, cleanup }
}
