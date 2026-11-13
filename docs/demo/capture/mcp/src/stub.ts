/**
 * In-memory stand-in for the probe MCP tool surface.
 *
 * The walk's `--self-test` and the beat tests drive the real beat functions
 * against this. Beat sequencing, action coverage, and `marks.log` rows run
 * with no emulator, no adb, and no docker.
 *
 * It models the probes the app ships: `shell`, `ssh_setup`, `chat`,
 * `create_session`, `changes`, and `file_diff`. Fact keys and action names are
 * copied from the Kotlin probes. The self-test fails when the driver invents a
 * verb or waits on a fact the app never publishes.
 *
 * `hostNow()` advances on each tool call and on each typed character. The walk
 * stamps `key` rows from that clock. `receiveCharacter` appends one character
 * to the focused field.
 */

import type { CallTool } from "./client"
import { fieldForTag, isTypeFieldName, tagByField } from "./input.text"
import type { TypeFieldName } from "./input.text"
import type { ProbeMark, ScreenSnapshot } from "./probe"

const CALL_LATENCY_SEC = 0.004
const POLL_SEC = 0.4
const WAIT_POLLS = 60
const VIEWPORT = { width: 1080, height: 2400 }

/** A turn takes this long on the stub clock before it settles. */
const TURN_SEC = 1.2

export const STUB_PUBLIC_KEY =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIStubStubStubStubStubStubStubStubStub12 stub@harold"

export const STUB_FINGERPRINT = "SHA256:iKE0VpdoZwc0iRm1SFqsMzAm89GgjOX+tBGfqa4dJ8s"

export const STUB_SESSION_ID = "sess_cat_mode"
export const STUB_WORKSPACE_ID = "ws_cat_screensaver"
export const STUB_AGENT_ID = "agent_opencode"
export const STUB_QUESTION_KEY = "cat_mode"
export const STUB_ANSWER_VALUE = "settings_toggle"
export const STUB_BRANCH_FILE = "src/settings.js"
export const STUB_PR_URL = "https://github.com/codenamegary/cat-screensaver/pull/7"

const PLAN_REPLY = [
  "Plan: add a Cat mode toggle to Settings, keep the behaviour in cat-mode.js,",
  "cover it with a unit test, and commit on feat/cat-mode.",
].join(" ")

const PLAN_REPLY_DONE = `${PLAN_REPLY} Settings toggle selected.`

const BUILD_REPLY = [
  "Implemented the toggle in src/settings.js, added src/cat-mode.js and its tests,",
  "and committed every change on feat/cat-mode. The worktree is clean.",
].join(" ")

const PR_REPLY = `Pushed feat/cat-mode and opened a draft PR: ${STUB_PR_URL}`

export type StubCall = Readonly<{
  name: string
  args: Record<string, unknown>
  hostSec: number
  /** The screen that was mounted when the call arrived. */
  screen: string | null
}>

export type ProbeControlSnapshot = ScreenSnapshot["controls"][number]

export type StubInput = Readonly<{
  field: TypeFieldName
  character: string
}>

export type ProbeStub = Readonly<{
  callTool: CallTool
  hostNow: () => number
  viewport: () => Promise<{ width: number; height: number }>
  calls: () => readonly StubCall[]
  ledger: () => readonly ProbeMark[]
  inputs: () => readonly StubInput[]
  receiveCharacter: (character: string) => Promise<void>
  clearFocused: (current: string) => Promise<void>
  facts: () => Record<string, string>
  screenName: () => string | null
  controls: () => readonly ProbeControlSnapshot[]
}>

type StubRow = Readonly<{ id: string; label: string }>

type StubChoice = Readonly<{ value: string; title: string }>

type StubElicitation = Readonly<{
  requestId: string
  title: string
  questionKey: string
  options: readonly StubChoice[]
}>

type ChatTurn = "none" | "plan" | "answer" | "build" | "pr"

type StubState = {
  hostSec: number
  screen: string | null
  anchorNanos: number
  ledger: ProbeMark[]
  calls: StubCall[]
  inputs: StubInput[]
  focusedField: TypeFieldName | null
  /** Name tracks the host suggestion until the name field itself is edited. */
  nameFollowsHost: boolean
  // ssh_setup
  testing: boolean
  testingPolls: number
  fingerprint: string
  trusted: boolean
  values: Record<string, string>
  // chat
  sessionId: string
  sessionName: string
  sessionMenuOpen: boolean
  sessionMenuCount: number
  mode: string
  modeOptions: readonly string[]
  model: string
  composerText: string
  composerSubmitting: boolean
  running: boolean
  pendingSec: number
  turn: ChatTurn
  attachments: readonly string[]
  usage: string
  usageCost: string
  changesBadgeCount: number
  elicitation: StubElicitation | null
  elicitationSheetOpen: boolean
  elicitationDraft: string
  elicitationSubmitting: boolean
  lastAssistantText: string
  // create_session
  workspaces: readonly StubRow[]
  agents: readonly StubRow[]
  selectedWorkspaceId: string
  selectedAgentId: string
  workspaceMenuOpen: boolean
  agentMenuOpen: boolean
  submittingCreate: boolean
  createError: string
  // changes
  scope: "uncommitted" | "branch"
  baseBranch: string
  branchFiles: readonly string[]
  worktreeSheetOpen: boolean
  worktrees: readonly Readonly<{ branch: string }>[]
  loadingChanges: boolean
  // file_diff
  diffPath: string
  diffHunks: number
  diffLines: number
}

const CAT_ELICITATION: StubElicitation = {
  requestId: "elicit_cat_mode",
  title: "Cat mode",
  questionKey: STUB_QUESTION_KEY,
  options: [
    { value: STUB_ANSWER_VALUE, title: "Settings toggle" },
    { value: "automatic", title: "Automatic" },
  ],
}

const initialState = (): StubState => ({
  hostSec: 1,
  screen: "shell",
  anchorNanos: 0,
  ledger: [],
  calls: [],
  inputs: [],
  focusedField: null,
  nameFollowsHost: true,
  testing: false,
  testingPolls: 0,
  fingerprint: "",
  trusted: false,
  // The form's port starts at 22. The walk clears it in pre-roll.
  values: { host: "", port: "22", user: "", name: "" },
  sessionId: "",
  sessionName: "",
  sessionMenuOpen: false,
  sessionMenuCount: 2,
  mode: "agent",
  modeOptions: ["agent", "plan", "build"],
  model: "OpenCode",
  composerText: "",
  composerSubmitting: false,
  running: false,
  pendingSec: 0,
  turn: "none",
  attachments: [],
  usage: "",
  usageCost: "",
  changesBadgeCount: 0,
  elicitation: null,
  elicitationSheetOpen: false,
  elicitationDraft: "",
  elicitationSubmitting: false,
  lastAssistantText: "",
  workspaces: [
    { id: STUB_WORKSPACE_ID, label: "cat-screensaver" },
    { id: "ws_harold", label: "harold" },
  ],
  agents: [
    { id: "agent_claude", label: "Claude Agent" },
    { id: "agent_codex", label: "Codex" },
    { id: "agent_cursor", label: "Cursor" },
    { id: "agent_gemini", label: "Gemini CLI" },
    { id: STUB_AGENT_ID, label: "OpenCode" },
  ],
  selectedWorkspaceId: "",
  selectedAgentId: "agent_claude",
  workspaceMenuOpen: false,
  agentMenuOpen: false,
  submittingCreate: false,
  createError: "",
  scope: "uncommitted",
  baseBranch: "main",
  branchFiles: [STUB_BRANCH_FILE, "src/cat-mode.js", "test/cat-mode.test.js"],
  worktreeSheetOpen: false,
  worktrees: [{ branch: "main" }, { branch: "feat/cat-mode" }],
  loadingChanges: false,
  diffPath: "",
  diffHunks: 1,
  diffLines: 18,
})

const control = (
  tag: string,
  top: number,
  enabled = true,
): ProbeControlSnapshot => ({
  tag,
  left: 60,
  top,
  right: 1020,
  bottom: top + 140,
  x: 540,
  y: top + 70,
  enabled,
})

// --- shell -------------------------------------------------------------------

const shellFacts = (): Record<string, string> => ({
  status: "No connections yet",
  addConnectionLabel: "Add connection",
  addConnectionEnabled: "true",
  retryVisible: "false",
})

const shellActions = (): readonly string[] => ["add_connection", "retry"]

const shellControls = (): readonly ProbeControlSnapshot[] => [
  control("shell_add_connection_button", 2100),
]

// --- ssh_setup ---------------------------------------------------------------

const hostFilled = (state: StubState): boolean =>
  state.values.host.length > 0 && state.values.user.length > 0 && state.values.port.length > 0

const sshFacts = (state: StubState): Record<string, string> => ({
  host: state.values.host,
  port: state.values.port,
  user: state.values.user,
  name: state.values.name,
  authMode: "GeneratedKey",
  publicKey: STUB_PUBLIC_KEY,
  fingerprint: state.fingerprint,
  trusted: String(state.trusted),
  testing: String(state.testing),
  saving: "false",
  canTest: String(hostFilled(state)),
  canSave: String(state.trusted),
  error: "",
})

const sshActions = (): readonly string[] => [
  "type",
  "set",
  "test_connection",
  "trust",
  "save",
  "back",
  "auth_mode",
]

const sshControls = (state: StubState): readonly ProbeControlSnapshot[] => [
  control("ssh_name_field", 300),
  control("ssh_host_field", 900),
  control("ssh_user_field", 1500),
  control("ssh_port_field", 1500),
  control("ssh_test_button", 1700, hostFilled(state)),
  ...(state.fingerprint.length > 0 ? [control("ssh_trust_checkbox", 1900)] : []),
  control("ssh_save_button", 2100, state.trusted),
]

// --- chat --------------------------------------------------------------------

const elicitationOptionsFact = (request: StubElicitation | null): string =>
  request === null
    ? ""
    : request.options
        .map((option) => `${request.questionKey}=${option.value}:${option.title}`)
        .join("|")

const sessionStateFact = (state: StubState): string => {
  if (state.elicitation !== null) {
    return "waiting"
  }
  if (state.running || state.composerSubmitting) {
    return "running"
  }
  return "idle"
}

const chatFacts = (state: StubState): Record<string, string> => ({
  sessionId: state.sessionId,
  sessionName: state.sessionName,
  sessionState: sessionStateFact(state),
  sessionMenuOpen: String(state.sessionMenuOpen),
  sessionMenuCount: String(state.sessionMenuCount),
  mode: state.mode,
  modeOptions: state.modeOptions.join(","),
  model: state.model,
  composerText: state.composerText,
  composerEnabled: String(state.sessionId.length > 0),
  sendEnabled: String(state.sessionId.length > 0 && state.composerText.trim().length > 0),
  attachmentCount: String(state.attachments.length),
  attachmentNames: state.attachments.join("|"),
  usage: state.usage,
  usageCost: state.usageCost,
  changesBadgeCount: String(state.changesBadgeCount),
  elicitationPending: String(state.elicitation !== null),
  elicitationRequestId: state.elicitation?.requestId ?? "",
  elicitationSheetOpen: String(state.elicitation !== null && state.elicitationSheetOpen),
  elicitationTitle: state.elicitation?.title ?? "",
  elicitationQuestionCount: state.elicitation === null ? "0" : "1",
  elicitationOptions: elicitationOptionsFact(state.elicitation),
  elicitationDraftValid: String(state.elicitation !== null && state.elicitationDraft.length > 0),
  elicitationSubmitting: String(state.elicitationSubmitting),
  lastAssistantText: state.lastAssistantText,
  running: String(state.running),
  composerSubmitting: String(state.composerSubmitting),
  error: "",
})

const chatActions = (): readonly string[] => [
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
]

const chatControls = (state: StubState): readonly ProbeControlSnapshot[] => [
  control("session_selector", 120),
  control("chat_session_label", 120),
  control("chat_changes", 120),
  control("chat_transcript", 600),
  control("composer_config_mode_chip", 1780),
  control("chat_attach_photo_button", 1820),
  control("chat_attach_files_button", 1820),
  control("chat_composer", 1900),
  control("chat_send_button", 2000, state.composerText.trim().length > 0),
  ...(state.sessionMenuOpen
    ? [
        control("session_menu", 300),
        control("session_menu_new", 380),
        control("session_menu_see_all", 460),
        control("session_menu_row_sess_welcome", 540),
      ]
    : []),
  ...(state.elicitation !== null
    ? [control("elicitation_card", 1500), control("elicitation_answer_button", 1520)]
    : []),
  ...(state.elicitation !== null && state.elicitationSheetOpen
    ? [
        control("elicitation_sheet", 1300),
        ...(state.elicitation?.options ?? []).map((option, index) =>
          control(
            `elicitation_option_${STUB_QUESTION_KEY}_${option.value}`,
            1400 + index * 160,
          ),
        ),
        control("elicitation_submit", 1800, state.elicitationDraft.length > 0),
      ]
    : []),
]

// --- create_session ----------------------------------------------------------

const selectedWorkspace = (state: StubState): StubRow | undefined =>
  state.workspaces.find((row) => row.id === state.selectedWorkspaceId)

const selectedAgent = (state: StubState): StubRow | undefined =>
  state.agents.find((row) => row.id === state.selectedAgentId)

const createSessionSubmitEnabled = (state: StubState): boolean =>
  !state.submittingCreate &&
  selectedWorkspace(state) !== undefined &&
  selectedAgent(state) !== undefined

const createSessionFacts = (state: StubState): Record<string, string> => ({
  workspaceId: state.selectedWorkspaceId,
  workspaceLabel: selectedWorkspace(state)?.label ?? "",
  workspaceCount: String(state.workspaces.length),
  workspaceIds: state.workspaces.map((row) => row.id).join("|"),
  workspaceLabels: state.workspaces.map((row) => row.label).join("|"),
  agentId: state.selectedAgentId,
  agentLabel: selectedAgent(state)?.label ?? "",
  agentCount: String(state.agents.length),
  agentIds: state.agents.map((option) => option.id).join("|"),
  agentLabels: state.agents.map((option) => option.label).join("|"),
  submitEnabled: String(createSessionSubmitEnabled(state)),
  submitting: String(state.submittingCreate),
  error: state.createError,
})

const createSessionActions = (): readonly string[] => [
  "pick_workspace",
  "pick_agent",
  "submit",
  "back",
]

const createSessionControls = (state: StubState): readonly ProbeControlSnapshot[] => [
  control("create_session_screen", 120),
  control("create_session_back", 120),
  control("create_session_workspace", 500),
  ...(state.workspaceMenuOpen
    ? state.workspaces.map((row, index) =>
        control(`create_session_workspace_option_${row.id}`, 600 + index * 160),
      )
    : []),
  control("create_session_agent", 900),
  ...(state.agentMenuOpen
    ? state.agents.map((option, index) =>
        control(`create_session_agent_option_${option.id}`, 1000 + index * 160),
      )
    : []),
  control("create_session_submit", 1900, createSessionSubmitEnabled(state)),
]

// --- changes -----------------------------------------------------------------

const changesFiles = (state: StubState): readonly string[] =>
  state.scope === "branch" ? state.branchFiles : []

const changesFacts = (state: StubState): Record<string, string> => {
  const files = changesFiles(state)
  const loading = state.loadingChanges
  return {
    scope: state.scope,
    baseBranch: state.baseBranch,
    uncommittedCount: "0",
    branchCount: String(state.branchFiles.length),
    fileCount: String(files.length),
    filePaths: files.join("|"),
    worktreeBranch: "feat/cat-mode",
    worktreeSheetOpen: String(state.worktreeSheetOpen),
    worktreeCount: String(state.worktrees.length),
    worktreeBranches: state.worktrees.map((worktree) => worktree.branch).join("|"),
    loading: String(loading),
    empty: String(!loading && files.length === 0),
    error: "",
  }
}

const changesActions = (): readonly string[] => [
  "select_scope",
  "open_file",
  "open_worktree_sheet",
  "dismiss_worktree_sheet",
  "pick_worktree",
  "refresh",
  "back",
]

const changesControls = (state: StubState): readonly ProbeControlSnapshot[] => [
  control("changes_screen", 120),
  control("changes_back", 120),
  control("changes_segment_uncommitted", 400),
  control("changes_segment_branch", 400),
  control("changes_summary", 600),
  control("changes_list", 900),
  ...changesFiles(state).map((path, index) => control(`changes_file_${path}`, 1000 + index * 160)),
  control("changes_worktree_control", 2200),
  ...(state.worktreeSheetOpen
    ? [
        control("changes_worktree_sheet", 1500),
        ...state.worktrees.map((worktree, index) =>
          control(`changes_worktree_row_${worktree.branch}`, 1600 + index * 160),
        ),
      ]
    : []),
]

// --- file_diff ---------------------------------------------------------------

const fileDiffFacts = (state: StubState): Record<string, string> => ({
  path: state.diffPath,
  scope: "branch",
  hunkCount: String(state.diffPath.length === 0 ? 0 : state.diffHunks),
  lineCount: String(state.diffPath.length === 0 ? 0 : state.diffLines),
  truncated: "false",
  loading: "false",
  error: "",
})

const fileDiffActions = (): readonly string[] => ["back", "reload"]

const fileDiffControls = (): readonly ProbeControlSnapshot[] => [
  control("file_diff_screen", 120),
  control("file_diff_back", 120),
  control("diff_gutter", 600),
]

export const makeProbeStub = (): ProbeStub => {
  const state = initialState()

  const factsNow = (): Record<string, string> => {
    switch (state.screen) {
      case "shell":
        return shellFacts()
      case "ssh_setup":
        return sshFacts(state)
      case "chat":
        return chatFacts(state)
      case "create_session":
        return createSessionFacts(state)
      case "changes":
        return changesFacts(state)
      case "file_diff":
        return fileDiffFacts(state)
      default:
        return {}
    }
  }

  const actionsNow = (): readonly string[] => {
    switch (state.screen) {
      case "shell":
        return shellActions()
      case "ssh_setup":
        return sshActions()
      case "chat":
        return chatActions()
      case "create_session":
        return createSessionActions()
      case "changes":
        return changesActions()
      case "file_diff":
        return fileDiffActions()
      default:
        return []
    }
  }

  const controlsNow = (): readonly ProbeControlSnapshot[] => {
    switch (state.screen) {
      case "shell":
        return shellControls()
      case "ssh_setup":
        return sshControls(state)
      case "chat":
        return chatControls(state)
      case "create_session":
        return createSessionControls(state)
      case "changes":
        return changesControls(state)
      case "file_diff":
        return fileDiffControls()
      default:
        return []
    }
  }

  const settledNow = (): boolean => {
    switch (state.screen) {
      case "ssh_setup":
        return !state.testing
      case "chat":
        return !state.running && !state.composerSubmitting && !state.elicitationSubmitting
      case "create_session":
        return !state.submittingCreate
      case "changes":
        return !state.loadingChanges
      case "file_diff":
        return true
      default:
        return true
    }
  }

  const snapshot = (): ScreenSnapshot => ({
    screen: state.screen,
    settled: settledNow(),
    actions: [...actionsNow()],
    facts: factsNow(),
    controls: [...controlsNow()],
    marksCount: state.ledger.length,
    anchorNanos: state.anchorNanos,
  })

  const record = (name: string, args: Record<string, unknown>): void => {
    state.calls.push({ name, args, hostSec: state.hostSec, screen: state.screen })
    state.hostSec += CALL_LATENCY_SEC
  }

  // --- turns ---------------------------------------------------------------

  const turnFor = (prompt: string): ChatTurn => {
    if (prompt.includes("draft PR")) {
      return "pr"
    }
    if (prompt.includes("Implement only the plan")) {
      return "build"
    }
    if (prompt.includes("Plan only")) {
      return "plan"
    }
    return "none"
  }

  const finishTurn = (): void => {
    state.running = false
    state.composerSubmitting = false
    state.elicitationSubmitting = false
    state.pendingSec = 0
    const usage = "84.2k / 200k (42%)"
    switch (state.turn) {
      case "plan":
        state.lastAssistantText = PLAN_REPLY
        state.elicitation = CAT_ELICITATION
        state.usage = usage
        state.usageCost = "0.045"
        break
      case "answer":
        state.lastAssistantText = PLAN_REPLY_DONE
        state.usage = usage
        state.usageCost = "0.045"
        break
      case "build":
        state.lastAssistantText = BUILD_REPLY
        state.usage = usage
        state.usageCost = "0.052"
        state.changesBadgeCount = 0
        break
      case "pr":
        state.lastAssistantText = PR_REPLY
        break
      case "none":
        break
    }
    state.turn = "none"
  }

  const startTurn = (turn: ChatTurn): void => {
    state.turn = turn
    state.running = true
    state.composerSubmitting = true
    state.pendingSec = TURN_SEC
  }

  const settleOnce = (): void => {
    if (state.screen === "ssh_setup" && state.testing) {
      state.testingPolls += 1
      if (state.testingPolls >= 1) {
        state.testing = false
        state.fingerprint = STUB_FINGERPRINT
      }
    }
    if (state.pendingSec <= 0) {
      return
    }
    state.pendingSec -= POLL_SEC
    if (state.pendingSec > 0) {
      return
    }
    finishTurn()
  }

  // --- screen actions ------------------------------------------------------

  const saveToChat = (): void => {
    state.screen = "chat"
    state.trusted = false
    state.values = { host: "", port: "", user: "", name: "" }
    state.sessionId = ""
    state.sessionName = ""
    state.composerText = ""
  }

  const applySshAction = (action: string, args: Record<string, string>): void => {
    switch (action) {
      case "test_connection":
        state.testing = true
        state.testingPolls = 0
        return
      case "trust":
        state.trusted = args.value !== "false"
        return
      case "save":
        saveToChat()
        return
      case "back":
        state.screen = "shell"
        return
      case "auth_mode":
        return
      case "set": {
        const field = args.field ?? ""
        if (field in state.values) {
          state.values[field] = args.value ?? ""
        }
        return
      }
      case "type": {
        const field = args.field ?? ""
        const text = args.text ?? ""
        const gapMs = Number(args.gapMs ?? 30)
        if (!(field in state.values)) {
          return
        }
        if (args.append !== "true") {
          state.values[field] = ""
        }
        for (const character of text) {
          state.ledger.push({ nanos: state.ledger.length + 1, kind: "key" })
          state.values[field] = `${state.values[field]}${character}`
          state.hostSec += gapMs / 1000
        }
        state.ledger.push({ nanos: state.ledger.length + 1, kind: "keys_done" })
        return
      }
      default:
        return
    }
  }

  const applyChatAction = (action: string, args: Record<string, string>): void => {
    switch (action) {
      case "open_session_menu":
        state.sessionMenuOpen = true
        return
      case "close_session_menu":
        state.sessionMenuOpen = false
        return
      case "pick_session":
        state.sessionId = args.id ?? ""
        state.sessionMenuOpen = false
        return
      case "open_new_session":
        state.sessionMenuOpen = false
        state.selectedWorkspaceId = ""
        state.selectedAgentId = ""
        state.workspaceMenuOpen = false
        state.agentMenuOpen = false
        state.screen = "create_session"
        return
      case "see_all_sessions":
        state.sessionMenuOpen = false
        state.screen = "sessions"
        return
      case "set_mode":
        if (state.modeOptions.includes(args.value ?? "")) {
          state.mode = args.value ?? state.mode
        }
        return
      case "set_text":
        state.composerText = args.text ?? ""
        return
      case "type": {
        const text = args.text ?? ""
        const gapMs = Number(args.gapMs ?? 30)
        if (args.append !== "true") {
          state.composerText = ""
        }
        for (const character of text) {
          state.ledger.push({ nanos: state.ledger.length + 1, kind: "key" })
          state.composerText = `${state.composerText}${character}`
          state.hostSec += gapMs / 1000
        }
        state.ledger.push({ nanos: state.ledger.length + 1, kind: "keys_done" })
        return
      }
      case "send": {
        const prompt = state.composerText
        state.composerText = ""
        state.attachments = []
        startTurn(turnFor(prompt))
        return
      }
      case "cancel":
        state.running = false
        state.composerSubmitting = false
        state.pendingSec = 0
        state.turn = "none"
        return
      case "remove_attachment":
        state.attachments = state.attachments.filter((name) => name !== args.name)
        return
      case "attach_fixture":
        state.attachments = ["cat-photo.jpg", "cat-mode.md"]
        return
      case "open_elicitation":
        state.elicitationSheetOpen = state.elicitation !== null
        return
      case "select_option":
        if (state.elicitation !== null) {
          state.elicitationDraft = args.optionValue ?? ""
        }
        return
      case "submit_elicitation":
        state.elicitation = null
        state.elicitationSheetOpen = false
        state.elicitationSubmitting = true
        startTurn("answer")
        return
      case "decline_elicitation":
        state.elicitation = null
        state.elicitationSheetOpen = false
        return
      case "close_elicitation":
        state.elicitationSheetOpen = false
        return
      case "open_changes":
        state.screen = "changes"
        return
      case "back":
        state.screen = "ssh_setup"
        return
      default:
        return
    }
  }

  const applyCreateSessionAction = (action: string, args: Record<string, string>): void => {
    switch (action) {
      case "pick_workspace":
        if (state.workspaces.some((row) => row.id === args.id)) {
          state.selectedWorkspaceId = args.id ?? ""
        }
        return
      case "pick_agent":
        if (state.agents.some((option) => option.id === args.agentId)) {
          state.selectedAgentId = args.agentId ?? ""
        }
        return
      case "submit":
        // The host answers in one step here; a real submit round trips, which
        // `submitting` and `settled()` model when it does.
        if (createSessionSubmitEnabled(state)) {
          state.workspaceMenuOpen = false
          state.agentMenuOpen = false
          state.screen = "chat"
          state.sessionId = STUB_SESSION_ID
          state.sessionName = "Cat mode"
          state.mode = "agent"
          state.lastAssistantText = ""
          state.usage = ""
          state.usageCost = ""
        }
        return
      case "back":
        state.screen = "chat"
        return
      default:
        return
    }
  }

  const applyChangesAction = (action: string, args: Record<string, string>): void => {
    switch (action) {
      case "select_scope":
        state.scope = args.value === "branch" ? "branch" : "uncommitted"
        return
      case "open_file":
        state.diffPath = args.path ?? ""
        state.screen = "file_diff"
        return
      case "open_worktree_sheet":
        state.worktreeSheetOpen = true
        return
      case "dismiss_worktree_sheet":
        state.worktreeSheetOpen = false
        return
      case "pick_worktree":
        state.worktreeSheetOpen = false
        return
      case "refresh":
        return
      case "back":
        state.screen = "chat"
        return
      default:
        return
    }
  }

  const applyFileDiffAction = (action: string): void => {
    if (action === "back") {
      state.screen = "changes"
    }
  }

  const perform = (action: string, args: Record<string, string>): void => {
    switch (state.screen) {
      case "shell":
        if (action === "add_connection") {
          state.screen = "ssh_setup"
        }
        return
      case "ssh_setup":
        applySshAction(action, args)
        return
      case "chat":
        applyChatAction(action, args)
        return
      case "create_session":
        applyCreateSessionAction(action, args)
        return
      case "changes":
        applyChangesAction(action, args)
        return
      case "file_diff":
        applyFileDiffAction(action)
        return
      default:
        return
    }
  }

  // --- tools ---------------------------------------------------------------

  const tap = (args: Record<string, unknown>) => {
    const tag = String(args.tag ?? "")
    const target = controlsNow().find((candidate) => candidate.tag === tag)
    if (target === undefined) {
      const known = controlsNow().map((candidate) => candidate.tag).join(", ")
      throw new Error(`no control tagged ${tag}. Known controls: ${known || "(none)"}`)
    }
    if (!target.enabled) {
      throw new Error(`${tag} is present but disabled`)
    }
    const field = fieldForTag(tag)
    if (field !== undefined) {
      state.focusedField = field
    }
    if (tag === "shell_add_connection_button") {
      state.screen = "ssh_setup"
    }
    if (tag === "ssh_trust_checkbox") {
      state.trusted = !state.trusted
    }
    if (tag === "ssh_test_button") {
      state.testing = true
      state.testingPolls = 0
    }
    if (tag === "ssh_save_button") {
      saveToChat()
    }
    if (tag === "session_selector") {
      state.sessionMenuOpen = true
    }
    if (tag === "session_menu_new") {
      applyChatAction("open_new_session", {})
    }
    if (tag === "chat_changes") {
      state.screen = "changes"
    }
    if (tag === "create_session_submit") {
      applyCreateSessionAction("submit", {})
    }
    if (tag === "create_session_workspace") {
      state.workspaceMenuOpen = !state.workspaceMenuOpen
      state.agentMenuOpen = false
    }
    if (tag === "create_session_agent") {
      state.agentMenuOpen = !state.agentMenuOpen
      state.workspaceMenuOpen = false
    }
    if (tag.startsWith("create_session_workspace_option_")) {
      state.selectedWorkspaceId = tag.slice("create_session_workspace_option_".length)
      state.workspaceMenuOpen = false
    }
    if (tag.startsWith("create_session_agent_option_")) {
      state.selectedAgentId = tag.slice("create_session_agent_option_".length)
      state.agentMenuOpen = false
    }
    if (tag === "changes_segment_branch") {
      state.scope = "branch"
    }
    if (tag === "changes_segment_uncommitted") {
      state.scope = "uncommitted"
    }
    if (tag === "changes_worktree_control") {
      state.worktreeSheetOpen = true
    }
    const xFraction =
      args.xFraction === undefined ? undefined : Math.min(1, Math.max(0, Number(args.xFraction)))
    const x =
      xFraction === undefined
        ? target.x
        : Math.round(target.left + (target.right - target.left) * xFraction)
    return { tag, x, y: target.y, screen: state.screen }
  }

  const currentFieldText = (field: TypeFieldName): string =>
    field === "composerText" ? state.composerText : (state.values[field] ?? "")

  const appendCharacter = (field: TypeFieldName, character: string): void => {
    state.inputs.push({ field, character })
    if (field === "composerText") {
      state.composerText = `${state.composerText}${character}`
      return
    }
    state.values[field] = `${state.values[field] ?? ""}${character}`
    if (field === "name") {
      state.nameFollowsHost = false
    }
    if (field === "host" && state.nameFollowsHost) {
      const host = state.values.host ?? ""
      state.values.name = host.split(".")[0] ?? ""
    }
  }

  const clearFocused = async (current: string): Promise<void> => {
    const field = state.focusedField
    if (field === null) {
      throw new Error("no field is focused")
    }
    const value = currentFieldText(field)
    if (value !== current) {
      throw new Error(`${field} holds ${JSON.stringify(value)}, not ${JSON.stringify(current)}`)
    }
    if (field === "composerText") {
      state.composerText = ""
    } else {
      state.values[field] = ""
    }
    if (field === "name") {
      state.nameFollowsHost = false
    }
  }

  const receiveCharacter = async (character: string): Promise<void> => {
    const field = state.focusedField
    if (field === null) {
      throw new Error("no field is focused")
    }
    appendCharacter(field, character)
    state.hostSec += CALL_LATENCY_SEC
  }

  /**
   * Same contract as `harold_type`: the field must already be empty, then each
   * character lands on its own. The walk types through `receiveCharacter`.
   */
  const typeIntoForm = (args: Record<string, unknown>) => {
    const field = String(args.field ?? "")
    if (!isTypeFieldName(field)) {
      throw new Error(`no field named ${field} on ${state.screen ?? "the current screen"}`)
    }
    const tag = tagByField[field]
    if (!controlsNow().some((candidate) => candidate.tag === tag)) {
      throw new Error(`no control tagged ${tag} on ${state.screen ?? "the current screen"}`)
    }
    const current = currentFieldText(field)
    if (current !== "") {
      const error = new Error(
        `FieldNotEmpty: ${field} holds ${JSON.stringify(current)}. Clear it before the recorded slice.`,
      )
      error.name = "FieldNotEmpty"
      throw error
    }
    state.focusedField = field
    const text = String(args.text ?? "")
    for (const character of text) {
      appendCharacter(field, character)
      state.hostSec += CALL_LATENCY_SEC
    }
    return { field, value: currentFieldText(field) }
  }

  const setField = (args: Record<string, unknown>) => {
    const field = String(args.field ?? "")
    if (state.screen !== "ssh_setup" || !(field in state.values)) {
      throw new Error(`no field named ${field} on ${state.screen ?? "the current screen"}`)
    }
    state.values[field] = String(args.value ?? "")
    return { field, value: state.values[field] }
  }

  const intent = (args: Record<string, unknown>) => {
    const action = String(args.action ?? "")
    const rawArgs = args.args
    const actionArgs: Record<string, string> =
      typeof rawArgs === "object" && rawArgs !== null && !Array.isArray(rawArgs)
        ? Object.fromEntries(
            Object.entries(rawArgs).map(([key, value]) => [key, String(value)]),
          )
        : {}
    const declared = actionsNow()
    if (!declared.includes(action)) {
      throw new Error(
        `the ${state.screen ?? "current"} screen does not declare ${action}; ` +
          `it declares ${declared.join(", ") || "(none)"}`,
      )
    }
    const before = state.ledger.length
    perform(action, actionArgs)
    return {
      ...snapshot(),
      ok: true,
      action,
      marks: state.ledger.slice(before),
    }
  }

  const satisfied = (
    field: string | undefined,
    equals: string | undefined,
    settled: boolean | undefined,
  ): boolean => {
    const facts = factsNow()
    const factOk =
      field === undefined
        ? true
        : equals === undefined
          ? (facts[field] ?? "").length > 0
          : facts[field] === equals
    const settledOk = settled === undefined ? true : settledNow() === settled
    return factOk && settledOk
  }

  const wait = (args: Record<string, unknown>) => {
    const field = args.field === undefined ? undefined : String(args.field)
    const equals = args.equals === undefined ? undefined : String(args.equals)
    const settled = args.settled === undefined ? undefined : Boolean(args.settled)
    for (const attempt of Array.from({ length: WAIT_POLLS }, (_, index) => index)) {
      if (satisfied(field, equals, settled)) {
        return { ok: true, screen: state.screen, facts: factsNow() }
      }
      settleOnce()
      state.hostSec += POLL_SEC
      if (attempt === WAIT_POLLS - 1) {
        break
      }
    }
    throw new Error(
      `timed out waiting for ${field ?? "settled"}${equals === undefined ? "" : `=${equals}`}. ` +
        `Last facts: ${JSON.stringify(factsNow())}`,
    )
  }

  const callTool: CallTool = async (name, args = {}) => {
    record(name, args)
    switch (name) {
      case "harold_screen":
        return snapshot()
      case "harold_navigate": {
        const route = String(args.route ?? "")
        if (route !== "ssh_setup" && route !== "chat") {
          throw new Error(`harold_navigate has no route ${route}`)
        }
        state.screen = route
        return { ok: true, screen: route }
      }
      case "harold_tap":
        return tap(args)
      case "harold_scroll_to": {
        const tag = String(args.tag ?? "")
        const target = controlsNow().find((candidate) => candidate.tag === tag)
        if (target === undefined) {
          throw new Error(`${tag} never came into view after 10 swipes`)
        }
        return { tag, x: target.x, y: target.y, swipes: 0 }
      }
      case "harold_type":
        return typeIntoForm(args)
      case "harold_set":
        return setField(args)
      case "harold_intent":
        return intent(args)
      case "harold_wait":
        return wait(args)
      case "harold_marks": {
        const since = Number(args.since ?? 0)
        return state.ledger.slice(since)
      }
      case "harold_clear_marks":
        state.ledger = []
        return { ok: true }
      default:
        throw new Error(`the stub does not implement ${name}`)
    }
  }

  return {
    callTool,
    hostNow: () => state.hostSec,
    viewport: async () => VIEWPORT,
    calls: () => state.calls,
    ledger: () => state.ledger,
    inputs: () => state.inputs,
    receiveCharacter,
    clearFocused,
    facts: () => factsNow(),
    screenName: () => state.screen,
    controls: () => controlsNow(),
  }
}
