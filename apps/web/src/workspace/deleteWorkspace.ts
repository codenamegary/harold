import {
  parseWorkspaceProblem,
  WorkspaceProblemDetails,
} from "./parseWorkspaceProblem"

export type WorkspaceDeleteError = Error & {
  problem: WorkspaceProblemDetails
}

const createWorkspaceDeleteError = (
  problem: WorkspaceProblemDetails,
): WorkspaceDeleteError => {
  const error = new Error(problem.detail) as WorkspaceDeleteError
  error.name = "WorkspaceDeleteError"
  error.problem = problem
  return error
}

export const isWorkspaceDeleteError = (error: unknown): error is WorkspaceDeleteError =>
  error instanceof Error && error.name === "WorkspaceDeleteError"

export const deleteWorkspace = async (workspaceId: string) => {
  const response = await fetch(`/v1/workspaces/${workspaceId}`, {
    method: "DELETE",
  })

  if (!response.ok) {
    const problem = await parseWorkspaceProblem(response)
    throw createWorkspaceDeleteError(problem)
  }
}
