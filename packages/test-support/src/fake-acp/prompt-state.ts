export type FakeAcpPromptState = {
  cancelled: boolean
  activeSessionId: string | null
}

export const createFakeAcpPromptState = (): FakeAcpPromptState => ({
  cancelled: false,
  activeSessionId: null,
})
