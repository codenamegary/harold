import { describe, expect, test } from "bun:test"
import { AgentSettings } from "contracts/http/agent-settings"
import { Workspace } from "contracts/http/workspace"
import { RegisterWorkspaceResult } from "core/workspace/register.usecase"
import { SetupPrompts, SetupRecipe, runSetupWizard, SetupWizardDeps } from "./setup.wizard"

const timestamp = "2026-10-04T00:00:00.000Z"

const makeAgent = (
  overrides: Partial<AgentSettings> & Pick<AgentSettings, "id" | "displayName">,
): AgentSettings => ({
  available: true,
  enabled: false,
  path: "/usr/local/bin/agent",
  args: [],
  present: true,
  popular: true,
  deletable: false,
  state: { status: "stopped", error: null },
  capabilities: null,
  authSummary: { status: "unknown", error: null, activeSessionId: null, canLogout: false },
  ...overrides,
})

const makeWorkspace = (path: string): Workspace => ({
  id: "ws_01J0000000000000000000000",
  name: "project",
  path,
  state: "available",
  createdAt: timestamp,
  lastUsedAt: timestamp,
})

const cancelSymbol = Symbol("cancel")

type PromptQueue<T> = Array<T | typeof cancelSymbol>

type PromptScript = Readonly<{
  multiselect?: PromptQueue<readonly string[]>
  text?: PromptQueue<string>
  select?: PromptQueue<string>
  confirm?: PromptQueue<boolean>
}>

type PromptCalls = {
  multiselect: Array<Readonly<{ message: string; initialValues: readonly string[] }>>
  text: Array<Readonly<{ message: string }>>
  select: Array<Readonly<{ message: string }>>
  confirm: Array<Readonly<{ message: string; initialValue: boolean }>>
}

const makePrompts = (
  script: PromptScript = {},
): Readonly<{
  prompts: SetupPrompts
  calls: PromptCalls
  notes: string[]
  infos: string[]
  warns: string[]
  cancelSymbol: typeof cancelSymbol
}> => {
  const calls: PromptCalls = { multiselect: [], text: [], select: [], confirm: [] }
  const notes: string[] = []
  const infos: string[] = []
  const warns: string[] = []

  const next = <T>(queue: PromptQueue<T> | undefined, name: string): T | typeof cancelSymbol => {
    const value = queue?.shift()
    if (value === undefined) {
      throw new Error(`unexpected ${name} prompt`)
    }
    return value
  }

  const prompts: SetupPrompts = {
    intro: () => undefined,
    outro: () => undefined,
    note: (message) => {
      notes.push(message)
    },
    info: (message) => {
      infos.push(message)
    },
    warn: (message) => {
      warns.push(message)
    },
    step: () => undefined,
    multiselect: async (options) => {
      calls.multiselect.push(options)
      return next(script.multiselect, "multiselect")
    },
    text: async (options) => {
      calls.text.push(options)
      return next(script.text, "text")
    },
    select: async (options) => {
      calls.select.push(options)
      return next(script.select, "select")
    },
    confirm: async (options) => {
      calls.confirm.push(options)
      return next(script.confirm, "confirm")
    },
    isCancel: (value): value is symbol => value === cancelSymbol,
    cancel: () => undefined,
  }

  return { prompts, calls, notes, infos, warns, cancelSymbol }
}

type HarnessOptions = Readonly<{
  agents?: readonly AgentSettings[]
  workspaces?: readonly Workspace[]
  workspaceResult?: RegisterWorkspaceResult
  verifyResults?: boolean[]
  pairResult?: boolean
  daemonRunning?: boolean
  interactive?: boolean
  script?: PromptScript
}>

const makeHarness = (options: HarnessOptions = {}) => {
  const agents = [...(options.agents ?? [])]
  const workspaces = [...(options.workspaces ?? [])]
  const enabled: string[] = []
  const disabled: string[] = []
  const registered: string[] = []
  const verified: string[] = []
  const lines: string[] = []
  const guided: string[] = []
  const pair = { calls: 0 }
  const promptBundle = makePrompts(options.script)
  const recipes: readonly SetupRecipe[] = [
    {
      id: "custom",
      label: "I already have an endpoint",
      hint: "operator-supplied endpoint",
      guide: () => {
        guided.push("custom")
      },
    },
  ]

  const findAgent = (id: string): AgentSettings | undefined =>
    agents.find((agent) => agent.id === id)

  const deps: SetupWizardDeps = {
    dataDir: "/home/dev/.harold",
    cwd: "/home/dev",
    interactive: options.interactive ?? true,
    prompts: promptBundle.prompts,
    colors: {
      red: (text) => text,
      yellow: (text) => text,
    },
    writeLine: (line) => lines.push(line),
    agents: {
      list: () => [...agents],
      enable: (id) => {
        enabled.push(id)
        const agent = findAgent(id)
        if (agent !== undefined) {
          const updated = { ...agent, enabled: true }
          agents.splice(agents.indexOf(agent), 1, updated)
          return { ok: true, value: updated }
        }
        return { ok: true, value: makeAgent({ id, displayName: id, enabled: true }) }
      },
      disable: (id) => {
        disabled.push(id)
        const agent = findAgent(id)
        if (agent === undefined) {
          return { ok: false, error: { kind: "not_found" } }
        }
        const updated = { ...agent, enabled: false }
        agents.splice(agents.indexOf(agent), 1, updated)
        return { ok: true, value: updated }
      },
    },
    workspaces: {
      list: () => [...workspaces],
      register: async (path) => {
        registered.push(path)
        if (options.workspaceResult !== undefined) {
          return options.workspaceResult
        }
        const value = makeWorkspace(path)
        workspaces.push(value)
        return { ok: true, value }
      },
    },
    recipes,
    reachability: {
      verifyAndPersist: async (advertisedUrl) => {
        verified.push(advertisedUrl)
        return options.verifyResults?.shift() ?? true
      },
    },
    pair: async () => {
      pair.calls += 1
      return options.pairResult ?? true
    },
    isDaemonRunning: () => options.daemonRunning ?? true,
  }

  return {
    deps,
    enabled,
    disabled,
    registered,
    verified,
    guided,
    lines,
    pair,
    calls: promptBundle.calls,
    notes: promptBundle.notes,
    infos: promptBundle.infos,
    warns: promptBundle.warns,
    cancelSymbol,
  }
}

const noPrompts = { multiselect: [], text: [], select: [], confirm: [] }

describe("runSetupWizard with flags", () => {
  test("applies agents, workspace, and reachability flags without prompting", async () => {
    const harness = makeHarness({
      agents: [makeAgent({ id: "cursor", displayName: "Cursor" })],
    })

    const exitCode = await runSetupWizard(harness.deps, {
      agents: ["cursor"],
      workspace: "/home/dev/project",
      advertisedUrl: "https://harold.example.com",
      pair: false,
    })

    expect(exitCode).toBe(0)
    expect(harness.enabled).toEqual(["cursor"])
    expect(harness.registered).toEqual(["/home/dev/project"])
    expect(harness.verified).toEqual(["https://harold.example.com"])
    expect(harness.pair.calls).toBe(0)
    expect(harness.calls).toEqual(noPrompts)
  })
})

describe("runSetupWizard agents step", () => {
  test("interactive selection enables chosen agents and disables the rest", async () => {
    const harness = makeHarness({
      agents: [
        makeAgent({ id: "cursor", displayName: "Cursor", enabled: true }),
        makeAgent({ id: "claude", displayName: "Claude", enabled: true }),
        makeAgent({ id: "gemini", displayName: "Gemini", present: false }),
      ],
      script: { multiselect: [["cursor"]] },
    })

    const exitCode = await runSetupWizard(harness.deps, {
      agents: undefined,
      workspace: "/home/dev/project",
      advertisedUrl: "https://harold.example.com",
      pair: false,
    })

    expect(exitCode).toBe(0)
    expect(harness.enabled).toEqual([])
    expect(harness.disabled).toEqual(["claude"])
    expect(harness.calls.multiselect).toHaveLength(1)
    expect(harness.calls.multiselect[0]?.initialValues).toEqual(["cursor", "claude"])
  })

  test("rejects an unknown agent id in --agents", async () => {
    const harness = makeHarness({
      agents: [makeAgent({ id: "cursor", displayName: "Cursor" })],
    })

    const exitCode = await runSetupWizard(harness.deps, {
      agents: ["nope"],
      workspace: "/home/dev/project",
      advertisedUrl: "https://harold.example.com",
      pair: false,
    })

    expect(exitCode).toBe(1)
    expect(harness.enabled).toEqual([])
    expect(harness.registered).toEqual([])
    expect(harness.verified).toEqual([])
  })
})

describe("runSetupWizard workspace step", () => {
  test("interactive prompt registers the entered path", async () => {
    const harness = makeHarness({
      agents: [makeAgent({ id: "cursor", displayName: "Cursor" })],
      script: { text: ["/home/dev/project"] },
    })

    const exitCode = await runSetupWizard(harness.deps, {
      agents: ["cursor"],
      workspace: undefined,
      advertisedUrl: "https://harold.example.com",
      pair: false,
    })

    expect(exitCode).toBe(0)
    expect(harness.registered).toEqual(["/home/dev/project"])
    expect(harness.calls.text[0]?.message.toLowerCase()).toContain("workspace")
  })

  test("re-running with the same --workspace path is a no-op", async () => {
    const harness = makeHarness({
      agents: [makeAgent({ id: "cursor", displayName: "Cursor" })],
      workspaces: [makeWorkspace("/home/dev/project")],
    })

    const exitCode = await runSetupWizard(harness.deps, {
      agents: ["cursor"],
      workspace: "/home/dev/project",
      advertisedUrl: "https://harold.example.com",
      pair: false,
    })

    expect(exitCode).toBe(0)
    expect(harness.registered).toEqual([])
  })

  test("a failed --workspace registration stops setup", async () => {
    const harness = makeHarness({
      agents: [makeAgent({ id: "cursor", displayName: "Cursor" })],
      workspaceResult: { ok: false, error: { kind: "path", error: { kind: "missing" } } },
    })

    const exitCode = await runSetupWizard(harness.deps, {
      agents: ["cursor"],
      workspace: "/home/dev/project",
      advertisedUrl: "https://harold.example.com",
      pair: false,
    })

    expect(exitCode).toBe(1)
    expect(harness.verified).toEqual([])
  })
})

describe("runSetupWizard reachability step", () => {
  test("interactive reachability guides the recipe, then verifies the entered URL", async () => {
    const harness = makeHarness({
      agents: [makeAgent({ id: "cursor", displayName: "Cursor" })],
      script: { select: ["custom"], text: ["https://harold.example.com"] },
    })

    const exitCode = await runSetupWizard(harness.deps, {
      agents: ["cursor"],
      workspace: "/home/dev/project",
      advertisedUrl: undefined,
      pair: false,
    })

    expect(exitCode).toBe(0)
    expect(harness.guided).toEqual(["custom"])
    expect(harness.verified).toEqual(["https://harold.example.com"])
    expect(harness.calls.select[0]?.message).toContain("phone")
  })

  test("retries after a failed verification when the operator asks", async () => {
    const harness = makeHarness({
      agents: [makeAgent({ id: "cursor", displayName: "Cursor" })],
      verifyResults: [false, true],
      script: {
        select: ["custom"],
        text: ["https://bad.example.com", "https://harold.example.com"],
        confirm: [true],
      },
    })

    const exitCode = await runSetupWizard(harness.deps, {
      agents: ["cursor"],
      workspace: "/home/dev/project",
      advertisedUrl: undefined,
      pair: false,
    })

    expect(exitCode).toBe(0)
    expect(harness.verified).toEqual(["https://bad.example.com", "https://harold.example.com"])
  })

  test("a failed --advertised-url verification stops setup", async () => {
    const harness = makeHarness({
      agents: [makeAgent({ id: "cursor", displayName: "Cursor" })],
      verifyResults: [false],
    })

    const exitCode = await runSetupWizard(harness.deps, {
      agents: ["cursor"],
      workspace: "/home/dev/project",
      advertisedUrl: "https://bad.example.com",
      pair: false,
    })

    expect(exitCode).toBe(1)
    expect(harness.pair.calls).toBe(0)
  })
})

describe("runSetupWizard agent probes", () => {
  test("points at provider sign-in for agents that need auth", async () => {
    const harness = makeHarness({
      agents: [
        makeAgent({
          id: "cursor",
          displayName: "Cursor",
          enabled: true,
          authSummary: {
            status: "needs_auth",
            error: null,
            activeSessionId: null,
            canLogout: false,
          },
        }),
      ],
    })

    const exitCode = await runSetupWizard(harness.deps, {
      agents: ["cursor"],
      workspace: "/home/dev/project",
      advertisedUrl: "https://harold.example.com",
      pair: false,
    })

    const output = harness.lines.join("\n")

    expect(exitCode).toBe(0)
    expect(output).toContain("Cursor")
    expect(output.toLowerCase()).toContain("sign in")
  })

  test("stays quiet when agent auth is already settled", async () => {
    const harness = makeHarness({
      agents: [
        makeAgent({
          id: "cursor",
          displayName: "Cursor",
          enabled: true,
          authSummary: {
            status: "authenticated",
            error: null,
            activeSessionId: null,
            canLogout: true,
          },
        }),
      ],
    })

    await runSetupWizard(harness.deps, {
      agents: ["cursor"],
      workspace: "/home/dev/project",
      advertisedUrl: "https://harold.example.com",
      pair: false,
    })

    expect(harness.lines.join("\n").toLowerCase()).not.toContain("sign in")
  })
})

describe("runSetupWizard pair step", () => {
  test("asks before pairing interactively", async () => {
    const harness = makeHarness({
      agents: [makeAgent({ id: "cursor", displayName: "Cursor" })],
      script: { confirm: [true] },
    })

    const exitCode = await runSetupWizard(harness.deps, {
      agents: ["cursor"],
      workspace: "/home/dev/project",
      advertisedUrl: "https://harold.example.com",
      pair: true,
    })

    expect(exitCode).toBe(0)
    expect(harness.pair.calls).toBe(1)
    expect(harness.calls.confirm[0]?.message).toContain("Pair")
  })

  test("skips pairing when the operator declines", async () => {
    const harness = makeHarness({
      agents: [makeAgent({ id: "cursor", displayName: "Cursor" })],
      script: { confirm: [false] },
    })

    const exitCode = await runSetupWizard(harness.deps, {
      agents: ["cursor"],
      workspace: "/home/dev/project",
      advertisedUrl: "https://harold.example.com",
      pair: true,
    })

    expect(exitCode).toBe(0)
    expect(harness.pair.calls).toBe(0)
  })

  test("pairs without a prompt when not interactive", async () => {
    const harness = makeHarness({
      agents: [makeAgent({ id: "cursor", displayName: "Cursor" })],
      interactive: false,
    })

    const exitCode = await runSetupWizard(harness.deps, {
      agents: ["cursor"],
      workspace: "/home/dev/project",
      advertisedUrl: "https://harold.example.com",
      pair: true,
    })

    expect(exitCode).toBe(0)
    expect(harness.pair.calls).toBe(1)
    expect(harness.calls.confirm).toEqual([])
  })

  test("fails when pairing does not complete", async () => {
    const harness = makeHarness({
      agents: [makeAgent({ id: "cursor", displayName: "Cursor" })],
      interactive: false,
      pairResult: false,
    })

    const exitCode = await runSetupWizard(harness.deps, {
      agents: ["cursor"],
      workspace: "/home/dev/project",
      advertisedUrl: "https://harold.example.com",
      pair: true,
    })

    expect(exitCode).toBe(1)
  })

  test("skips the wait when the daemon is not running", async () => {
    const harness = makeHarness({
      agents: [makeAgent({ id: "cursor", displayName: "Cursor" })],
      daemonRunning: false,
      interactive: false,
    })

    const exitCode = await runSetupWizard(harness.deps, {
      agents: ["cursor"],
      workspace: "/home/dev/project",
      advertisedUrl: "https://harold.example.com",
      pair: true,
    })

    expect(exitCode).toBe(0)
    expect(harness.pair.calls).toBe(0)
    expect(harness.warns.join("\n")).toContain("harold serve")
  })
})
