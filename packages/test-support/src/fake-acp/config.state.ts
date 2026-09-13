export type FakeConfigOption = {
  id: string
  name?: string
  description?: string | null
  category?: string | null
  type: "select" | "boolean"
  currentValue: string | boolean
  options?: ReadonlyArray<{
    value: string
    name: string
    description?: string | null
    _meta?: unknown
  }>
  _meta?: unknown
}

export type FakeAcpConfigState = {
  initialize: (sessionId: string) => void
  get: (sessionId: string) => ReadonlyArray<FakeConfigOption> | undefined
  apply: (
    sessionId: string,
    configId: string,
    value: string | boolean,
  ) => "ok" | "unknown-session" | "invalid"
}

const cloneOption = (option: FakeConfigOption): FakeConfigOption => ({
  ...option,
  ...(option.options === undefined ? {} : { options: [...option.options] }),
})

export const createFakeAcpConfigState = (
  initial: ReadonlyArray<FakeConfigOption>,
): FakeAcpConfigState => {
  const sessions = new Map<string, FakeConfigOption[]>()

  return {
    initialize: (sessionId) => {
      if (initial.length === 0) {
        return
      }
      sessions.set(sessionId, initial.map(cloneOption))
    },
    get: (sessionId) => sessions.get(sessionId),
    apply: (sessionId, configId, value) => {
      const options = sessions.get(sessionId)
      if (options === undefined) {
        return "unknown-session"
      }

      const option = options.find((candidate) => candidate.id === configId)
      if (option === undefined) {
        return "invalid"
      }

      if (option.type === "select") {
        if (typeof value !== "string") {
          return "invalid"
        }
        if (option.options === undefined || !option.options.some((item) => item.value === value)) {
          return "invalid"
        }
      } else if (typeof value !== "boolean") {
        return "invalid"
      }

      option.currentValue = value
      return "ok"
    },
  }
}
