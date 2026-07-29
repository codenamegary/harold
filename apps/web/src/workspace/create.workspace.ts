import { CreateWorkspaceBody, WorkspaceSchema } from "contracts/http/workspace"
import {
  parseWorkspaceProblem,
  WorkspaceProblemDetails,
} from "./parse.workspace.problem"

export type WorkspaceCreateError = Error & {
  problem: WorkspaceProblemDetails
}

const createWorkspaceCreateError = (
  problem: WorkspaceProblemDetails,
): WorkspaceCreateError => {
  const error = new Error(problem.detail) as WorkspaceCreateError
  error.name = "WorkspaceCreateError"
  error.problem = problem
  return error
}

export const isWorkspaceCreateError = (error: unknown): error is WorkspaceCreateError =>
  error instanceof Error && error.name === "WorkspaceCreateError"

export const createWorkspace = async (body: CreateWorkspaceBody) => {
  const response = await fetch("/v1/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const problem = await parseWorkspaceProblem(response)
    throw createWorkspaceCreateError(problem)
  }

  const payload: unknown = await response.json()
  return WorkspaceSchema.parse(payload)
}
