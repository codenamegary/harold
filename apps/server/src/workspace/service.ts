import { CreateWorkspaceBody, Workspace } from "contracts/http/workspace"
import { WorkspaceRepository, UpdateWorkspaceNameInput } from "./repository"
import { WorkspaceRepositoryError } from "./workspace-errors"

export type WorkspaceServiceResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: WorkspaceRepositoryError }

type WorkspaceServiceContext = {
  workspaceRepository: WorkspaceRepository
}

export const createWorkspaceService = (context: WorkspaceServiceContext) => {
  const create = (input: CreateWorkspaceBody): WorkspaceServiceResult<Workspace> =>
    context.workspaceRepository.create(input)

  const updateName = (
    input: UpdateWorkspaceNameInput,
  ): WorkspaceServiceResult<Workspace> => context.workspaceRepository.updateName(input)

  const deleteWorkspace = (input: { id: string }): WorkspaceServiceResult<void> =>
    context.workspaceRepository.delete(input)

  return {
    create,
    updateName,
    delete: deleteWorkspace,
  }
}

export type WorkspaceService = ReturnType<typeof createWorkspaceService>
