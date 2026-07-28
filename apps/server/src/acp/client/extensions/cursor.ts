import { ExtensionHandlers } from "./types"

type CursorAskQuestionParams = {
  questions?: Array<{
    id?: string
    options?: Array<{ id?: string; label?: string }>
  }>
}

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
