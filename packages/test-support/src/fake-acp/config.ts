export type FakeAcpCapabilities = {
  loadSession: boolean
  sessionClose: boolean
  sessionList: boolean
}

export type FakeAcpConfig = FakeAcpCapabilities & {
  sessionNewSessionId: string | undefined
  sessionLoadSessionId: string
  sessionCloseFails: boolean
  sessionLoadFails: boolean
  sessionNewFailsWithAuthRequired: boolean
  promptFailsWithAuthRequired: boolean
  emitPermissionRequest: boolean
  emitPermissionRequestNoAllow: boolean
  emitPermissionRequestOnPrompt: boolean
  emitFsReadRequest: boolean
  emitFsWriteRequest: boolean
  emitTerminalCreateRequest: boolean
  emitCursorAskQuestion: boolean
  emitCursorCreatePlan: boolean
  emitUnknownExtension: boolean
  emitSessionUpdatesOnPrompt: boolean
  emitToolUpdatesOnPrompt: boolean
  emitLoadReplayUpdates: boolean
  promptCompletionDelayMs: number | undefined
  fsReadPath: string
  fsWritePath: string
  fsWriteContent: string
  terminalCommand: string
}

const parseBooleanEnv = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) {
    return defaultValue
  }
  return value === "true" || value === "1"
}

const parseOptionalNonNegativeIntEnv = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined
  }

  return parsed
}

const readEnvString = (
  env: Record<string, string | undefined>,
  key: string,
  defaultValue: string,
): string => env[key] ?? defaultValue

const stringEnv = (key: string, value: string | undefined): Record<string, string> | undefined =>
  value === undefined ? undefined : { [key]: value }

export const readFakeAcpConfig = (
  env: Record<string, string | undefined> = process.env,
): FakeAcpConfig => ({
  loadSession: parseBooleanEnv(env.FAKE_ACP_LOAD_SESSION, false),
  sessionClose: parseBooleanEnv(env.FAKE_ACP_SESSION_CLOSE, false),
  sessionList: parseBooleanEnv(env.FAKE_ACP_SESSION_LIST, true),
  sessionNewSessionId: env.FAKE_ACP_SESSION_NEW_SESSION_ID,
  sessionLoadSessionId: readEnvString(env, "FAKE_ACP_SESSION_LOAD_SESSION_ID", "fake-session-load"),
  sessionCloseFails: parseBooleanEnv(env.FAKE_ACP_SESSION_CLOSE_FAILS, false),
  sessionLoadFails: parseBooleanEnv(env.FAKE_ACP_SESSION_LOAD_FAILS, false),
  sessionNewFailsWithAuthRequired: parseBooleanEnv(
    env.FAKE_ACP_SESSION_NEW_FAILS_WITH_AUTH_REQUIRED,
    false,
  ),
  promptFailsWithAuthRequired: parseBooleanEnv(
    env.FAKE_ACP_PROMPT_FAILS_WITH_AUTH_REQUIRED,
    false,
  ),
  emitPermissionRequest: parseBooleanEnv(env.FAKE_ACP_EMIT_PERMISSION_REQUEST, false),
  emitPermissionRequestNoAllow: parseBooleanEnv(env.FAKE_ACP_EMIT_PERMISSION_REQUEST_NO_ALLOW, false),
  emitPermissionRequestOnPrompt: parseBooleanEnv(env.FAKE_ACP_EMIT_PERMISSION_REQUEST_ON_PROMPT, false),
  emitFsReadRequest: parseBooleanEnv(env.FAKE_ACP_EMIT_FS_READ_REQUEST, false),
  emitFsWriteRequest: parseBooleanEnv(env.FAKE_ACP_EMIT_FS_WRITE_REQUEST, false),
  emitTerminalCreateRequest: parseBooleanEnv(env.FAKE_ACP_EMIT_TERMINAL_CREATE_REQUEST, false),
  emitCursorAskQuestion: parseBooleanEnv(env.FAKE_ACP_EMIT_CURSOR_ASK_QUESTION, false),
  emitCursorCreatePlan: parseBooleanEnv(env.FAKE_ACP_EMIT_CURSOR_CREATE_PLAN, false),
  emitUnknownExtension: parseBooleanEnv(env.FAKE_ACP_EMIT_UNKNOWN_EXTENSION, false),
  emitSessionUpdatesOnPrompt: parseBooleanEnv(env.FAKE_ACP_EMIT_SESSION_UPDATES_ON_PROMPT, false),
  emitToolUpdatesOnPrompt: parseBooleanEnv(env.FAKE_ACP_EMIT_TOOL_UPDATES_ON_PROMPT, false),
  emitLoadReplayUpdates: parseBooleanEnv(env.FAKE_ACP_EMIT_LOAD_REPLAY_UPDATES, false),
  promptCompletionDelayMs: parseOptionalNonNegativeIntEnv(env.FAKE_ACP_PROMPT_COMPLETION_DELAY_MS),
  fsReadPath: readEnvString(env, "FAKE_ACP_FS_READ_PATH", "readme.txt"),
  fsWritePath: readEnvString(env, "FAKE_ACP_FS_WRITE_PATH", "output.txt"),
  fsWriteContent: readEnvString(env, "FAKE_ACP_FS_WRITE_CONTENT", "written-by-fake-acp"),
  terminalCommand: readEnvString(env, "FAKE_ACP_TERMINAL_COMMAND", "echo hello"),
})

export type FakeAcpEnvOptions = {
  capabilities?: Partial<FakeAcpCapabilities>
  sessionNewSessionId?: string
  sessionLoadSessionId?: string
  sessionCloseFails?: boolean
  sessionLoadFails?: boolean
  sessionNewFailsWithAuthRequired?: boolean
  promptFailsWithAuthRequired?: boolean
  emitPermissionRequest?: boolean
  emitPermissionRequestNoAllow?: boolean
  emitPermissionRequestOnPrompt?: boolean
  emitFsReadRequest?: boolean
  emitFsWriteRequest?: boolean
  emitTerminalCreateRequest?: boolean
  emitCursorAskQuestion?: boolean
  emitCursorCreatePlan?: boolean
  emitUnknownExtension?: boolean
  emitSessionUpdatesOnPrompt?: boolean
  emitToolUpdatesOnPrompt?: boolean
  emitLoadReplayUpdates?: boolean
  promptCompletionDelayMs?: number
  fsReadPath?: string
  fsWritePath?: string
  fsWriteContent?: string
  terminalCommand?: string
}

const optionalBooleanEnv = (
  key: string,
  value: boolean | undefined,
): Record<string, string> | undefined =>
  value === undefined ? undefined : { [key]: String(value) }

const optionalNumberEnv = (
  key: string,
  value: number | undefined,
): Record<string, string> | undefined =>
  value === undefined ? undefined : { [key]: String(value) }

export const fakeAcpEnvFromCapabilities = (options: FakeAcpEnvOptions): Record<string, string> => ({
  FAKE_ACP_LOAD_SESSION: String(options.capabilities?.loadSession ?? false),
  FAKE_ACP_SESSION_CLOSE: String(options.capabilities?.sessionClose ?? false),
  FAKE_ACP_SESSION_LIST: String(options.capabilities?.sessionList ?? true),
  ...stringEnv("FAKE_ACP_SESSION_NEW_SESSION_ID", options.sessionNewSessionId),
  ...stringEnv("FAKE_ACP_SESSION_LOAD_SESSION_ID", options.sessionLoadSessionId),
  ...optionalBooleanEnv("FAKE_ACP_SESSION_CLOSE_FAILS", options.sessionCloseFails),
  ...optionalBooleanEnv("FAKE_ACP_SESSION_LOAD_FAILS", options.sessionLoadFails),
  ...optionalBooleanEnv(
    "FAKE_ACP_SESSION_NEW_FAILS_WITH_AUTH_REQUIRED",
    options.sessionNewFailsWithAuthRequired,
  ),
  ...optionalBooleanEnv(
    "FAKE_ACP_PROMPT_FAILS_WITH_AUTH_REQUIRED",
    options.promptFailsWithAuthRequired,
  ),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_PERMISSION_REQUEST", options.emitPermissionRequest),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_PERMISSION_REQUEST_NO_ALLOW", options.emitPermissionRequestNoAllow),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_PERMISSION_REQUEST_ON_PROMPT", options.emitPermissionRequestOnPrompt),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_FS_READ_REQUEST", options.emitFsReadRequest),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_FS_WRITE_REQUEST", options.emitFsWriteRequest),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_TERMINAL_CREATE_REQUEST", options.emitTerminalCreateRequest),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_CURSOR_ASK_QUESTION", options.emitCursorAskQuestion),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_CURSOR_CREATE_PLAN", options.emitCursorCreatePlan),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_UNKNOWN_EXTENSION", options.emitUnknownExtension),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_SESSION_UPDATES_ON_PROMPT", options.emitSessionUpdatesOnPrompt),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_TOOL_UPDATES_ON_PROMPT", options.emitToolUpdatesOnPrompt),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_LOAD_REPLAY_UPDATES", options.emitLoadReplayUpdates),
  ...optionalNumberEnv("FAKE_ACP_PROMPT_COMPLETION_DELAY_MS", options.promptCompletionDelayMs),
  ...stringEnv("FAKE_ACP_FS_READ_PATH", options.fsReadPath),
  ...stringEnv("FAKE_ACP_FS_WRITE_PATH", options.fsWritePath),
  ...stringEnv("FAKE_ACP_FS_WRITE_CONTENT", options.fsWriteContent),
  ...stringEnv("FAKE_ACP_TERMINAL_COMMAND", options.terminalCommand),
})
