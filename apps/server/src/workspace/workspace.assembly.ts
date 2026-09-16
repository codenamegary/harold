import { FastifyInstance } from "fastify"
import { AgentDatabase } from "../persistence/database"
import { canonicalizePath } from "../filesystem/filesystem.canonicalize.path"
import { makeDeleteWorkspace } from "./workspace.delete.usecase"
import { makeRegisterWorkspace } from "./workspace.register.usecase"
import { createWorkspaceRepository } from "./workspace.repository"
import { registerWorkspaceRoutes } from "./workspace.routes"
import { makeFindWorkspaceById, makeInsertWorkspace } from "./workspace.sqlite.adapters"
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
  const insertWorkspace = makeInsertWorkspace(deps.database)
  const findWorkspaceById = makeFindWorkspaceById(deps.database)
  const workspaceRepository = createWorkspaceRepository(deps.database)
  const registerWorkspace = makeRegisterWorkspace({
    canonicalizePath,
    getAllowedRoots: deps.getAllowedRoots,
    insertWorkspace,
  })
  const deleteWorkspace = makeDeleteWorkspace({
    findWorkspaceById,
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
        findWorkspaceById,
        updateWorkspaceName: workspaceRepository.updateName,
        deleteWorkspace,
      })
    },
    findById: findWorkspaceById,
    listAll: workspaceRepository.listAll,
    deleteWorkspace,
  }
}
