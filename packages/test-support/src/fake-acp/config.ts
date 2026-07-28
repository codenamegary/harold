export type FakeAcpCapabilities = {
  loadSession: boolean
  sessionClose: boolean
}

export type FakeAcpConfig = FakeAcpCapabilities & {
  sessionNewSessionId: string
  sessionLoadSessionId: string
  sessionCloseFails: boolean
  sessionLoadFails: boolean
  emitPermissionRequest: boolean
  emitPermissionRequestNoAllow: boolean
  emitFsReadRequest: boolean
  emitFsWriteRequest: boolean
  emitTerminalCreateRequest: boolean
  emitCursorAskQuestion: boolean
  emitCursorCreatePlan: boolean
  emitUnknownExtension: boolean
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
  sessionNewSessionId: readEnvString(env, "FAKE_ACP_SESSION_NEW_SESSION_ID", "fake-session-new"),
  sessionLoadSessionId: readEnvString(env, "FAKE_ACP_SESSION_LOAD_SESSION_ID", "fake-session-load"),
  sessionCloseFails: parseBooleanEnv(env.FAKE_ACP_SESSION_CLOSE_FAILS, false),
  sessionLoadFails: parseBooleanEnv(env.FAKE_ACP_SESSION_LOAD_FAILS, false),
  emitPermissionRequest: parseBooleanEnv(env.FAKE_ACP_EMIT_PERMISSION_REQUEST, false),
  emitPermissionRequestNoAllow: parseBooleanEnv(env.FAKE_ACP_EMIT_PERMISSION_REQUEST_NO_ALLOW, false),
  emitFsReadRequest: parseBooleanEnv(env.FAKE_ACP_EMIT_FS_READ_REQUEST, false),
  emitFsWriteRequest: parseBooleanEnv(env.FAKE_ACP_EMIT_FS_WRITE_REQUEST, false),
  emitTerminalCreateRequest: parseBooleanEnv(env.FAKE_ACP_EMIT_TERMINAL_CREATE_REQUEST, false),
  emitCursorAskQuestion: parseBooleanEnv(env.FAKE_ACP_EMIT_CURSOR_ASK_QUESTION, false),
  emitCursorCreatePlan: parseBooleanEnv(env.FAKE_ACP_EMIT_CURSOR_CREATE_PLAN, false),
  emitUnknownExtension: parseBooleanEnv(env.FAKE_ACP_EMIT_UNKNOWN_EXTENSION, false),
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
  emitPermissionRequest?: boolean
  emitPermissionRequestNoAllow?: boolean
  emitFsReadRequest?: boolean
  emitFsWriteRequest?: boolean
  emitTerminalCreateRequest?: boolean
  emitCursorAskQuestion?: boolean
  emitCursorCreatePlan?: boolean
  emitUnknownExtension?: boolean
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

export const fakeAcpEnvFromCapabilities = (options: FakeAcpEnvOptions): Record<string, string> => ({
  FAKE_ACP_LOAD_SESSION: String(options.capabilities?.loadSession ?? false),
  FAKE_ACP_SESSION_CLOSE: String(options.capabilities?.sessionClose ?? false),
  ...stringEnv("FAKE_ACP_SESSION_NEW_SESSION_ID", options.sessionNewSessionId),
  ...stringEnv("FAKE_ACP_SESSION_LOAD_SESSION_ID", options.sessionLoadSessionId),
  ...optionalBooleanEnv("FAKE_ACP_SESSION_CLOSE_FAILS", options.sessionCloseFails),
  ...optionalBooleanEnv("FAKE_ACP_SESSION_LOAD_FAILS", options.sessionLoadFails),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_PERMISSION_REQUEST", options.emitPermissionRequest),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_PERMISSION_REQUEST_NO_ALLOW", options.emitPermissionRequestNoAllow),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_FS_READ_REQUEST", options.emitFsReadRequest),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_FS_WRITE_REQUEST", options.emitFsWriteRequest),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_TERMINAL_CREATE_REQUEST", options.emitTerminalCreateRequest),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_CURSOR_ASK_QUESTION", options.emitCursorAskQuestion),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_CURSOR_CREATE_PLAN", options.emitCursorCreatePlan),
  ...optionalBooleanEnv("FAKE_ACP_EMIT_UNKNOWN_EXTENSION", options.emitUnknownExtension),
  ...stringEnv("FAKE_ACP_FS_READ_PATH", options.fsReadPath),
  ...stringEnv("FAKE_ACP_FS_WRITE_PATH", options.fsWritePath),
  ...stringEnv("FAKE_ACP_FS_WRITE_CONTENT", options.fsWriteContent),
  ...stringEnv("FAKE_ACP_TERMINAL_COMMAND", options.terminalCommand),
})
