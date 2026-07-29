import { UpdateWorkspaceBody, WorkspaceSchema } from "contracts/http/workspace"
import {
  parseWorkspaceProblem,
  WorkspaceProblemDetails,
} from "./parse.workspace.problem"

export type WorkspaceUpdateError = Error & {
  problem: WorkspaceProblemDetails
}

const createWorkspaceUpdateError = (
  problem: WorkspaceProblemDetails,
): WorkspaceUpdateError => {
  const error = new Error(problem.detail) as WorkspaceUpdateError
  error.name = "WorkspaceUpdateError"
  error.problem = problem
  return error
}

export const isWorkspaceUpdateError = (error: unknown): error is WorkspaceUpdateError =>
  error instanceof Error && error.name === "WorkspaceUpdateError"

export const updateWorkspace = async (workspaceId: string, body: UpdateWorkspaceBody) => {
  const response = await fetch(`/v1/workspaces/${workspaceId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const problem = await parseWorkspaceProblem(response)
    throw createWorkspaceUpdateError(problem)
  }

  const payload: unknown = await response.json()
  return WorkspaceSchema.parse(payload)
}
