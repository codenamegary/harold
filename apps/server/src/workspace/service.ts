import { CreateWorkspaceBody, Workspace } from "contracts/http/workspace"
import { WorkspaceRepository, UpdateWorkspaceNameInput } from "./repository"
import { WorkspaceRepositoryError } from "./workspace.errors"

export type WorkspaceServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: WorkspaceRepositoryError }

type WorkspaceServiceContext = {
  workspaceRepository: WorkspaceRepository
  registerWorkspace: (dto: CreateWorkspaceBody) => WorkspaceServiceResult<Workspace>
}

export const createWorkspaceService = (context: WorkspaceServiceContext) => {
  const create = (input: CreateWorkspaceBody): WorkspaceServiceResult<Workspace> =>
    context.registerWorkspace(input)

  const updateName = (
    input: UpdateWorkspaceNameInput,
  ): WorkspaceServiceResult<Workspace> => context.workspaceRepository.updateName(input)

  return {
    create,
    updateName,
  }
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>
