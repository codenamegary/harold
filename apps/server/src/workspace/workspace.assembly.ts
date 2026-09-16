import { FastifyInstance } from "fastify"
import { AgentDatabase } from "../persistence/database"
import { canonicalizePath } from "../filesystem/filesystem.canonicalize.path"
import { makeDeleteWorkspace } from "./workspace.delete.usecase"
import { makeRegisterWorkspace } from "./workspace.register.usecase"
import { createWorkspaceRepository } from "./workspace.repository"
import { registerWorkspaceRoutes } from "./workspace.routes"
import {
  CloseWorkspaceSessions,
  DeleteWorkspace,
  FindWorkspaceById,
  GetAllowedRoots,
  ListAllWorkspaces,
  ListLiveByWorkspaceRoot,
  UnbindWorkspaceSessions,
} from "./workspace.ports"

export type AssembleWorkspaceSliceDeps = Readonly<{
  database: AgentDatabase
  getAllowedRoots: GetAllowedRoots
  listLiveByWorkspaceRoot: ListLiveByWorkspaceRoot
  closeWorkspaceSessions: CloseWorkspaceSessions
  unbindWorkspaceSessions: UnbindWorkspaceSessions
}>

export type WorkspaceSlice = Readonly<{
  registerRoutes: (app: FastifyInstance) => void
  findById: FindWorkspaceById
  listAll: ListAllWorkspaces
  deleteWorkspace: DeleteWorkspace
}>

export const assembleWorkspaceSlice = (deps: AssembleWorkspaceSliceDeps): WorkspaceSlice => {
  const workspaceRepository = createWorkspaceRepository(deps.database)
  const registerWorkspace = makeRegisterWorkspace({
    canonicalizePath,
    getAllowedRoots: deps.getAllowedRoots,
    insertWorkspace: workspaceRepository.insert,
  })
  const deleteWorkspace = makeDeleteWorkspace({
    findWorkspaceById: workspaceRepository.getById,
    listLiveByWorkspaceRoot: deps.listLiveByWorkspaceRoot,
    closeWorkspaceSessions: deps.closeWorkspaceSessions,
    unbindWorkspaceSessions: deps.unbindWorkspaceSessions,
    deleteWorkspaceRow: workspaceRepository.delete,
  })

  return {
    registerRoutes: (app) => {
      registerWorkspaceRoutes(app, {
        registerWorkspace,
        listWorkspaces: workspaceRepository.list,
        findWorkspaceById: workspaceRepository.getById,
        updateWorkspaceName: workspaceRepository.updateName,
        deleteWorkspace,
      })
    },
    findById: workspaceRepository.getById,
    listAll: workspaceRepository.listAll,
    deleteWorkspace,
  }
}
