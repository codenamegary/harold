import { FastifyInstance } from "fastify"
import { CreateWorkspaceBody } from "contracts/http/workspace"
import { makeDeleteWorkspace } from "core/workspace/delete.usecase"
import { makeRegisterWorkspace, RegisterWorkspaceResult } from "core/workspace/register.usecase"
import {
  CanonicalizePath,
  CloseWorkspaceSessions,
  DeleteWorkspace,
  FindWorkspaceById,
  GetAllowedRoots,
  ListAllWorkspaces,
  ListLiveByWorkspaceRoot,
  UnbindWorkspaceSessions,
} from "core/workspace/ports"
import { AgentDatabase } from "../persistence/database"
import { registerWorkspaceRoutes } from "./workspace.routes"
import {
  makeDeleteWorkspaceRow,
  makeFindWorkspaceById,
  makeInsertWorkspace,
  makeListAllWorkspaces,
  makeListWorkspaces,
  makeUpdateWorkspaceName,
} from "./workspace.sqlite.adapters"

export type AssembleWorkspaceSliceDeps = Readonly<{
  database: AgentDatabase
  canonicalizePath: CanonicalizePath
  getAllowedRoots: GetAllowedRoots
  listLiveByWorkspaceRoot: ListLiveByWorkspaceRoot
  closeWorkspaceSessions: CloseWorkspaceSessions
  unbindWorkspaceSessions: UnbindWorkspaceSessions
}>

export type WorkspaceSlice = Readonly<{
  registerRoutes: (app: FastifyInstance) => void
  registerWorkspace: (body: CreateWorkspaceBody) => RegisterWorkspaceResult
  findById: FindWorkspaceById
  listAll: ListAllWorkspaces
  deleteWorkspace: DeleteWorkspace
}>

export const assembleWorkspaceSlice = (deps: AssembleWorkspaceSliceDeps): WorkspaceSlice => {
  const insertWorkspace = makeInsertWorkspace(deps.database)
  const findWorkspaceById = makeFindWorkspaceById(deps.database)
  const listWorkspaces = makeListWorkspaces(deps.database)
  const listAllWorkspaces = makeListAllWorkspaces(deps.database)
  const updateWorkspaceName = makeUpdateWorkspaceName(deps.database)
  const deleteWorkspaceRow = makeDeleteWorkspaceRow(deps.database)
  const registerWorkspace = makeRegisterWorkspace({
    canonicalizePath: deps.canonicalizePath,
    getAllowedRoots: deps.getAllowedRoots,
    insertWorkspace,
  })
  const deleteWorkspace = makeDeleteWorkspace({
    findWorkspaceById,
    listLiveByWorkspaceRoot: deps.listLiveByWorkspaceRoot,
    closeWorkspaceSessions: deps.closeWorkspaceSessions,
    unbindWorkspaceSessions: deps.unbindWorkspaceSessions,
    deleteWorkspaceRow,
  })

  return {
    registerRoutes: (app) => {
      registerWorkspaceRoutes(app, {
        registerWorkspace,
        listWorkspaces,
        findWorkspaceById,
        updateWorkspaceName,
        deleteWorkspace,
      })
    },
    registerWorkspace,
    findById: findWorkspaceById,
    listAll: listAllWorkspaces,
    deleteWorkspace,
  }
}
