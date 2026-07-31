type SessionMutationError = Error & {
  problem: {
    detail: string
    fieldError?: string
  }
}

export const sessionMutationErrorMessage = (
  error: unknown,
  isTypedError: (error: unknown) => error is SessionMutationError,
  fallback: string,
) => {
  if (isTypedError(error)) {
    const fieldSuffix = error.problem.fieldError ? ` ${error.problem.fieldError}` : ""
    return `${error.problem.detail}${fieldSuffix}`
  }

  return fallback
}
