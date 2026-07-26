type WorkspaceMutationError = Error & {
  problem: {
    detail: string
    fieldError?: string
  }
}

export const workspaceMutationErrorMessage = (
  error: unknown,
  isTypedError: (error: unknown) => error is WorkspaceMutationError,
  fallback: string,
) => {
  if (isTypedError(error)) {
    const fieldSuffix = error.problem.fieldError ? ` ${error.problem.fieldError}` : ""
    return `${error.problem.detail}${fieldSuffix}`
  }

  return fallback
}
