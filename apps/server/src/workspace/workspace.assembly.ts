import { FastifyInstance } from "fastify"
import { AgentDatabase } from "../persistence/database"
import { canonicalizeWorkspacePath } from "./canonicalize.workspace.path"
import { makeDeleteWorkspace } from "./delete.usecase"
import { makeRegisterWorkspace } from "./register.usecase"
import { createWorkspaceRepository } from "./repository"
import { registerWorkspaceRoutes } from "./routes"
import { createWorkspaceService } from "./service"
import {
  CloseWorkspaceSessions,
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
  deleteWorkspace: ReturnType<typeof makeDeleteWorkspace>
}>

export const assembleWorkspaceSlice = (deps: AssembleWorkspaceSliceDeps): WorkspaceSlice => {
  const workspaceRepository = createWorkspaceRepository(deps.database)
  const registerWorkspace = makeRegisterWorkspace({
    canonicalizePath: canonicalizeWorkspacePath,
    getAllowedRoots: deps.getAllowedRoots,
    insertWorkspace: workspaceRepository.insert,
  })
  const workspaceService = createWorkspaceService({
    workspaceRepository,
    registerWorkspace,
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
      registerWorkspaceRoutes(app, workspaceRepository, workspaceService, deleteWorkspace)
    },
    findById: workspaceRepository.getById,
    listAll: workspaceRepository.listAll,
    deleteWorkspace,
  }
}
