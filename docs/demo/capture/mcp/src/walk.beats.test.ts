import { describe, expect, it } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { BUILD_PROMPT, PLAN_PROMPT, PR_PROMPT } from "./chat.prompts"
import { assertClosedKeyRuns, sortRows } from "./marks"
import type { MarkRow } from "./marks"
import { sliceNames } from "./slices"
import {
  makeProbeStub,
  STUB_ANSWER_VALUE,
  STUB_BRANCH_FILE,
  STUB_PR_URL,
  STUB_WORKSPACE_ID,
} from "./stub"
import type { ProbeStub } from "./stub"
import { BEATS, labeledValue, makeContext, parseArgs, runWalk, splitIdFact } from "./walk"
import type { Beat, DemoConfig, WalkDeps } from "./walk"

const CONFIG: DemoConfig = {
  host: "127.0.0.1",
  port: "2223",
  user: "gary",
  name: "Demo host",
  container: "harold-demo-host",
  typeGapMs: 80,
  workspace: "cat-screensaver",
  agent: "OpenCode",
  planMode: "plan",
  buildMode: "build",
  answerOption: "Settings toggle",
  diffFile: "settings.js",
  worktrees: ["main", "feat/cat-mode"],
}

/**
 * The action names from the Kotlin probes, restated here so a beat that invents
 * a verb fails the test even if the stub happens to accept it.
 */
const PROBE_ACTIONS: Record<string, readonly string[]> = {
  ssh_setup: ["type", "set", "test_connection", "trust", "save", "back", "auth_mode"],
  chat: [
    "open_session_menu",
    "close_session_menu",
    "pick_session",
    "open_new_session",
    "see_all_sessions",
    "set_mode",
    "set_text",
    "type",
    "send",
    "cancel",
    "remove_attachment",
    "attach_fixture",
    "open_elicitation",
    "select_option",
    "submit_elicitation",
    "decline_elicitation",
    "close_elicitation",
    "open_changes",
    "dismiss_keyboard",
    "back",
  ],
  create_session: ["pick_workspace", "pick_agent", "submit", "back"],
  changes: [
    "select_scope",
    "open_file",
    "open_worktree_sheet",
    "dismiss_worktree_sheet",
    "pick_worktree",
    "refresh",
    "back",
  ],
  file_diff: ["back", "reload"],
}

type Harness = Readonly<{
  stub: ProbeStub
  context: ReturnType<typeof makeContext>
  rowCount: () => number
}>

const harness = (): Harness => {
  const stub = makeProbeStub()
  const rows: string[] = []
  const context = makeContext({
    call: stub.callTool,
    hostNow: stub.hostNow,
    log: () => {},
    sleep: async () => {},
    sink: { push: (row) => rows.push(row.text), taps: true },
    config: CONFIG,
    viewport: stub.viewport,
    swipe: async () => {},
    dismissKeyboard: async () => {},
    authorizeKey: async () => {},
  })
  return { stub, context, rowCount: () => rows.length }
}

const toolNames = (stub: ProbeStub): readonly string[] => stub.calls().map((call) => call.name)

type IntentCall = Readonly<{ action: string; screen: string | null; args: Record<string, unknown> }>

const intentCalls = (stub: ProbeStub): readonly IntentCall[] =>
  stub
    .calls()
    .filter((call) => call.name === "harold_intent")
    .map((call) => ({
      action: String(call.args.action ?? ""),
      screen: call.screen,
      args:
        typeof call.args.args === "object" && call.args.args !== null
          ? (call.args.args as Record<string, unknown>)
          : {},
    }))

const actionsOf = (stub: ProbeStub): readonly string[] => intentCalls(stub).map((call) => call.action)

const tappedTags = (stub: ProbeStub): readonly string[] =>
  stub
    .calls()
    .filter((call) => call.name === "harold_tap")
    .map((call) => String(call.args.tag))

/** Run every beat up to and including `name`, the way `runWalk` does. */
const runThrough = async (name: Beat["name"]): Promise<Harness> => {
  const rehearsal = harness()
  const end = BEATS.findIndex((beat) => beat.name === name)
  for (const beat of BEATS.slice(0, end + 1)) {
    await beat.run(rehearsal.context)
  }
  return rehearsal
}

describe("BEATS", () => {
  it("covers the whole slice plan in order", () => {
    expect(BEATS.map((beat) => beat.name)).toEqual([...sliceNames])
  })

  it("has a runner for every beat", () => {
    for (const beat of BEATS) {
      expect(typeof beat.run).toBe("function")
    }
  })

  it("runs every beat against the stub with no device", async () => {
    const { stub, context } = harness()
    for (const beat of BEATS) {
      const before = stub.calls().length
      await beat.run(context)
      expect(stub.calls().length).toBeGreaterThan(before)
    }
    expect(toolNames(stub)).toContain("harold_navigate")
    expect(toolNames(stub)).toContain("harold_type")
    expect(toolNames(stub)).toContain("harold_wait")
  })
})

describe("beat sequencing", () => {
  it("types the four form fields in plan order", async () => {
    const { stub } = await runThrough("connect_fill")
    const typed = stub
      .calls()
      .filter((call) => call.name === "harold_type")
      .map((call) => String(call.args.field))
    expect(typed).toEqual(["host", "user", "port", "name"])
  })

  it("reads the fingerprint before it trusts, and trusts before it saves", async () => {
    const tested = await runThrough("connect_test")
    expect(tested.stub.facts().fingerprint.length).toBeGreaterThan(0)
    expect(toolNames(tested.stub)).toContain("harold_wait")

    const saved = await runThrough("connect_save")
    expect(tappedTags(saved.stub).slice(-3)).toEqual([
      "ssh_test_button",
      "ssh_trust_checkbox",
      "ssh_save_button",
    ])
    // The save leaves the form, so the trust fact is gone with it rather than
    // lingering as a second source of truth.
    expect(saved.stub.screenName()).toBe("chat")
    expect(saved.stub.facts().trusted).toBeUndefined()
  })

  it("closes every key run and writes marks for the fill beat", async () => {
    const { stub, rowCount } = await runThrough("connect_fill")
    expect(() => assertClosedKeyRuns(stub.ledger())).not.toThrow()
    expect(rowCount()).toBeGreaterThan(0)
  })

  it("ends on the chat with a live session and the form values cleared", async () => {
    const { stub, context } = harness()
    for (const beat of BEATS) {
      await beat.run(context)
    }
    expect(stub.screenName()).toBe("chat")
    expect(stub.facts().host ?? "").toBe("")
    expect((stub.facts().sessionId ?? "").length).toBeGreaterThan(0)
    expect(stub.facts().lastAssistantText).toContain(STUB_PR_URL)
  })
})

describe("runWalk failure behaviour", () => {
  const deps = (events: string[]): WalkDeps => {
    const stub = makeProbeStub()
    const dir = mkdtempSync(join(tmpdir(), "harold-walk-"))
    // The fingerprint never arrives, so the recorded beat fails the way a real
    // connection test that times out would.
    const call = async (name: string, args?: Record<string, unknown>): Promise<unknown> => {
      if (name === "harold_wait") {
        throw new Error("timed out waiting for fingerprint. Last facts: {}")
      }
      return stub.callTool(name, args)
    }
    return {
      call,
      hostNow: stub.hostNow,
      log: () => {},
      sleep: async () => {},
      config: CONFIG,
      device: {
        startRecording: async (remote) => {
          events.push(`start ${remote}`)
        },
        stopRecording: async () => {
          events.push("stop")
        },
        blink: async () => stub.hostNow(),
        pull: async (remote) => {
          events.push(`pull ${remote}`)
        },
      },
      viewport: stub.viewport,
      swipe: async () => {},
      dismissKeyboard: async () => {},
      authorizeKey: async () => {},
      out: {
        dir,
        slicesDir: dir,
        marksPath: join(dir, "marks.log"),
        manifestPath: join(dir, "slices.json"),
      },
      only: ["connect_test"],
    }
  }

  it("names the slice and stops the recorder when a beat cannot run", async () => {
    const events: string[] = []
    const failure = await runWalk(deps(events)).then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toMatch(/^slice connect_test: /)
    expect(events[0]).toBe("start /data/local/tmp/harold-demo-004-connect_test.mp4")
    expect(events).toContain("stop")
    expect(events.filter((event) => event.startsWith("pull"))).toEqual([])
  })
})

describe("parseArgs", () => {
  it("defaults to the work capture directory and every slice", () => {
    const cli = parseArgs([])
    expect(cli.only).toEqual([])
    expect(cli.list).toBe(false)
    expect(cli.selfTest).toBe(false)
    expect(cli.out.endsWith("work/capture")).toBe(true)
  })

  it("accepts a comma list, repeated flags and the equals form", () => {
    expect(parseArgs(["--only", "connect_trust,connect_empty"]).only).toEqual([
      "connect_empty",
      "connect_trust",
    ])
    expect(parseArgs(["--only", "connect_save", "--only", "connect_empty"]).only).toEqual([
      "connect_empty",
      "connect_save",
    ])
    expect(parseArgs(["--only=landing"]).only).toEqual(["landing"])
  })

  it("reads the serial and the output directory", () => {
    const cli = parseArgs(["--emulator-serial", "emulator-5556", "--out", "/tmp/out"])
    expect(cli.serial).toBe("emulator-5556")
    expect(cli.out).toBe("/tmp/out")
  })

  it("recognises --list, --self-test and --help", () => {
    expect(parseArgs(["--list"]).list).toBe(true)
    expect(parseArgs(["--self-test"]).selfTest).toBe(true)
    expect(parseArgs(["--help"]).help).toBe(true)
  })

  it("rejects an unknown flag and a missing value", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown argument --nope/)
    expect(() => parseArgs(["--out"])).toThrow(/--out needs a value/)
  })

  it("rejects a pre-roll slice in --only", () => {
    expect(() => parseArgs(["--only", "boot"])).toThrow(/pre-roll beats and are never recorded/)
  })
})

describe("marks rows stay ordered", () => {
  it("sorts host and converted device rows together", () => {
    const rows = sortRows([
      { atSec: 3, text: "c 3.000" },
      { atSec: 1, text: "a 1.000" },
      { atSec: 2, text: "b 2.000" },
    ])
    expect(rows.map((row) => row.text)).toEqual(["a 1.000", "b 2.000", "c 3.000"])
  })
})

describe("tap stamping", () => {
  /** A tap costs host time the way it does on the emulator: 0.24 s per call. */
  const TAP_COST_SEC = 0.24

  const timedHarness = () => {
    const stub = makeProbeStub()
    const rows: MarkRow[] = []
    let clock = 100
    const context = makeContext({
      call: async (name, args) => {
        if (name === "harold_tap") {
          clock += TAP_COST_SEC
        }
        return stub.callTool(name, args)
      },
      hostNow: () => clock,
      log: () => {},
      sleep: async () => {},
      sink: { push: (row) => rows.push(row), taps: true },
      config: CONFIG,
      viewport: stub.viewport,
      swipe: async () => {},
      dismissKeyboard: async () => {},
      authorizeKey: async () => {},
    })
    return { stub, rows, context }
  }

  it("stamps a tap at the midpoint of the tool call, not before it", async () => {
    const { rows, context } = timedHarness()
    await context.navigate("ssh_setup")
    await context.tap("ssh_host_field")
    expect(rows.length).toBe(1)
    expect(rows[0].atSec).toBeCloseTo(100 + TAP_COST_SEC / 2, 6)
    expect(rows[0].text).toMatch(/^tap \d+\.\d{3} \d+ \d+$/)
  })

  it("leaves the row unstamped outside a slice, so pre-roll taps stay off camera", async () => {
    const stub = makeProbeStub()
    const rows: MarkRow[] = []
    const context = makeContext({
      call: stub.callTool,
      hostNow: () => 100,
      log: () => {},
      sleep: async () => {},
      sink: { push: (row) => rows.push(row), taps: false },
      config: CONFIG,
      viewport: stub.viewport,
      swipe: async () => {},
      dismissKeyboard: async () => {},
      authorizeKey: async () => {},
    })
    await context.navigate("ssh_setup")
    await context.tap("ssh_host_field")
    expect(rows).toEqual([])
  })
})

describe("probe contract coverage", () => {
  it("only calls actions the probed screen declares", async () => {
    const { stub } = await runThrough("pr")
    const calls = intentCalls(stub)
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      const declared = PROBE_ACTIONS[call.screen ?? ""]
      expect(declared ?? []).toContain(call.action)
    }
  })

  it("never drives an uninstrumented screen", async () => {
    const { stub } = await runThrough("pr")
    const screens = new Set(intentCalls(stub).map((call) => call.screen))
    for (const screen of screens) {
      expect(Object.keys(PROBE_ACTIONS)).toContain(screen ?? "")
    }
  })

  it("emits at least one mark on every on-camera beat", async () => {
    const { stub, context, rowCount } = harness()
    for (const beat of BEATS) {
      const first = rowCount()
      await beat.run(context)
      if (beat.kind === "onCamera") {
        expect(rowCount()).toBeGreaterThan(first)
      }
    }
    expect(stub.screenName()).toBe("chat")
  })
})

describe("story beats", () => {
  it("starts a session on the configured workspace without touching the agent", async () => {
    const { stub } = await runThrough("new_session")
    const picked = intentCalls(stub).filter((call) => call.action === "pick_workspace")
    expect(picked.map((call) => call.args.id)).toEqual([STUB_WORKSPACE_ID])
    expect(actionsOf(stub)).not.toContain("pick_agent")
    expect((stub.facts().sessionId ?? "").length).toBeGreaterThan(0)
  })

  it("stages plan mode and both fixture attachments before the plan slice", async () => {
    const { stub } = await runThrough("plan_stage")
    expect(stub.facts().mode).toBe("plan")
    expect(stub.facts().attachmentCount).toBe("2")
    expect(stub.facts().composerText).toBe("")
    expect(actionsOf(stub)).toContain("attach_fixture")
  })

  it("types the plan prompt through the chat type action and sends it", async () => {
    const { stub } = await runThrough("plan")
    const typed = intentCalls(stub)
      .filter((call) => call.action === "type")
      .map((call) => String(call.args.text))
    expect(typed).toEqual([PLAN_PROMPT])
    expect(actionsOf(stub)).toContain("send")
  })

  it("answers the agent question with the configured option", async () => {
    const { stub } = await runThrough("question")
    const selected = intentCalls(stub).filter((call) => call.action === "select_option")
    expect(selected.map((call) => call.args.optionValue)).toEqual([STUB_ANSWER_VALUE])
    expect(actionsOf(stub)).toContain("open_elicitation")
    expect(actionsOf(stub)).toContain("submit_elicitation")
  })

  it("stages build mode and lets the turn settle before usage", async () => {
    const { stub } = await runThrough("build")
    const typed = intentCalls(stub)
      .filter((call) => call.action === "type")
      .map((call) => String(call.args.text))
    expect(typed).toEqual([PLAN_PROMPT, BUILD_PROMPT])
    expect(actionsOf(stub)).toContain("set_mode")
    expect(stub.facts().sessionState).toBe("idle")
    expect((stub.facts().lastAssistantText ?? "").length).toBeGreaterThan(0)
  })

  it("reads the empty uncommitted scope, opens the branch file and returns", async () => {
    const { stub } = await runThrough("changes")
    const scopes = intentCalls(stub)
      .filter((call) => call.action === "select_scope")
      .map((call) => call.args.value)
    expect(scopes).toEqual(["branch"])
    const opened = intentCalls(stub)
      .filter((call) => call.action === "open_file")
      .map((call) => call.args.path)
    expect(opened).toEqual([STUB_BRANCH_FILE])
    expect(stub.screenName()).toBe("changes")
    expect(stub.facts().scope).toBe("branch")
  })

  it("opens the worktree sheet on both branches and dismisses it", async () => {
    const { stub } = await runThrough("worktrees")
    const order = actionsOf(stub)
    const opened = order.indexOf("open_worktree_sheet")
    const dismissed = order.indexOf("dismiss_worktree_sheet")
    expect(opened).toBeGreaterThanOrEqual(0)
    expect(dismissed).toBeGreaterThan(opened)
    expect(stub.facts().worktreeSheetOpen).toBe("false")
    expect(stub.facts().worktreeBranches).toBe("main|feat/cat-mode")
  })

  it("types the PR prompt, sends it and ends on the PR URL", async () => {
    const { stub } = await runThrough("pr")
    const typed = intentCalls(stub)
      .filter((call) => call.action === "type")
      .map((call) => String(call.args.text))
    expect(typed).toEqual([PLAN_PROMPT, BUILD_PROMPT, PR_PROMPT])
    expect(stub.screenName()).toBe("chat")
    expect(stub.facts().lastAssistantText).toContain(STUB_PR_URL)
  })
})

describe("new-session id facts", () => {
  it("keeps a plain id list untouched", () => {
    expect(splitIdFact("ws_a|ws_b", 2)).toEqual(["ws_a", "ws_b"])
  })

  it("pairs connection-scoped ids back together", () => {
    const fact = [
      "ssh://gary@127.0.0.1:2223|ws_moonlit_garden",
      "ssh://gary@127.0.0.1:2223|ws_meow",
      "ssh://gary@127.0.0.1:2223|ws_cat_screensaver",
    ].join("|")
    expect(splitIdFact(fact, 3)).toEqual([
      "ssh://gary@127.0.0.1:2223|ws_moonlit_garden",
      "ssh://gary@127.0.0.1:2223|ws_meow",
      "ssh://gary@127.0.0.1:2223|ws_cat_screensaver",
    ])
  })

  it("finds the label's own id rather than the first fragment", () => {
    const fact = [
      "ssh://gary@127.0.0.1:2223|ws_moonlit_garden",
      "ssh://gary@127.0.0.1:2223|ws_cat_screensaver",
    ].join("|")
    const labels = ["moonlit-garden", "cat-screensaver"]
    expect(labeledValue(splitIdFact(fact, 2), labels, "cat-screensaver", "the form")).toBe(
      "ssh://gary@127.0.0.1:2223|ws_cat_screensaver",
    )
  })

  it("fails with the offered labels when the wanted one is absent", () => {
    expect(() => labeledValue(["a", "b"], ["one", "two"], "three", "the form")).toThrow(
      /offers \["one","two"\]; none matches "three"/,
    )
  })
})
