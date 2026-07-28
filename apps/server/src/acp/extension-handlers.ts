import { createAcpJsonRpcError } from "./acp-json-rpc-error"

type CursorAskQuestionParams = {
  questions?: Array<{
    id?: string
    options?: Array<{ id?: string; label?: string }>
  }>
}

export type ExtensionHandler = (params: unknown) => unknown | Promise<unknown>

export type ExtensionHandlers = Record<string, ExtensionHandler>

const cursorAskQuestionHandler = (params: unknown) => {
  const request = params as CursorAskQuestionParams
  const firstQuestion = request.questions?.[0]
  const firstOptionId = firstQuestion?.options?.[0]?.id

  if (!firstQuestion?.id || !firstOptionId) {
    return { outcome: { outcome: "skipped" as const } }
  }

  return {
    outcome: {
      outcome: "answered" as const,
      answers: [{
        questionId: firstQuestion.id,
        selectedOptionIds: [firstOptionId],
      }],
    },
  }
}

const cursorCreatePlanHandler = () => ({
  outcome: { outcome: "accepted" as const },
})

export const cursorExtensionHandlers: ExtensionHandlers = {
  "cursor/ask_question": cursorAskQuestionHandler,
  "cursor/create_plan": cursorCreatePlanHandler,
}

export const createUnknownExtensionHandler = (method: string): ExtensionHandler => () => {
  throw createAcpJsonRpcError(`unknown extension: ${method}`, -32601)
}

export const resolveExtensionHandler = (params: {
  method: string
  extensionHandlers: ExtensionHandlers
  onUnknown: (method: string) => void
}): ExtensionHandler | undefined => {
  const handler = params.extensionHandlers[params.method]
  if (handler) {
    return handler
  }

  if (!params.method.includes("/")) {
    return undefined
  }

  params.onUnknown(params.method)
  return createUnknownExtensionHandler(params.method)
}
