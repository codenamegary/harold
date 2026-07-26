export type FakeAcpCapabilities = {
  loadSession: boolean
  sessionClose: boolean
}

export type FakeAcpConfig = FakeAcpCapabilities & {
  sessionNewSessionId: string
  sessionLoadSessionId: string
  emitPermissionRequest: boolean
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

export const readFakeAcpConfig = (
  env: Record<string, string | undefined> = process.env,
): FakeAcpConfig => ({
  loadSession: parseBooleanEnv(env.FAKE_ACP_LOAD_SESSION, false),
  sessionClose: parseBooleanEnv(env.FAKE_ACP_SESSION_CLOSE, false),
  sessionNewSessionId: readEnvString(env, "FAKE_ACP_SESSION_NEW_SESSION_ID", "fake-session-new"),
  sessionLoadSessionId: readEnvString(env, "FAKE_ACP_SESSION_LOAD_SESSION_ID", "fake-session-load"),
  emitPermissionRequest: parseBooleanEnv(env.FAKE_ACP_EMIT_PERMISSION_REQUEST, false),
})

export const fakeAcpEnvFromCapabilities = (options: {
  capabilities?: Partial<FakeAcpCapabilities>
  sessionNewSessionId?: string
  sessionLoadSessionId?: string
  emitPermissionRequest?: boolean
}): Record<string, string> => ({
  FAKE_ACP_LOAD_SESSION: String(options.capabilities?.loadSession ?? false),
  FAKE_ACP_SESSION_CLOSE: String(options.capabilities?.sessionClose ?? false),
  ...(options.sessionNewSessionId
    ? { FAKE_ACP_SESSION_NEW_SESSION_ID: options.sessionNewSessionId }
    : {}),
  ...(options.sessionLoadSessionId
    ? { FAKE_ACP_SESSION_LOAD_SESSION_ID: options.sessionLoadSessionId }
    : {}),
  ...(options.emitPermissionRequest
    ? { FAKE_ACP_EMIT_PERMISSION_REQUEST: "true" }
    : {}),
})
