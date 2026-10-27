import { FastifyInstance } from "fastify"
import { CreateWorkspaceBody } from "contracts/http/workspace"
import { ReadDirectoryEntries } from "core/filesystem/ports"
import { makeDeleteWorkspace } from "core/workspace/delete.usecase"
import { makeFindOrCreateWorkspace } from "core/workspace/find.or.create.usecase"
import { makeRegisterWorkspace, RegisterWorkspaceResult } from "core/workspace/register.usecase"
import {
  CanonicalizePath,
  CloneRepository,
  CloseWorkspaceSessions,
  DeleteWorkspace,
  FindWorkspaceById,
  ListAllWorkspaces,
  ListLiveByWorkspaceRoot,
  UnbindWorkspaceSessions,
} from "core/workspace/ports"
import { AgentDatabase } from "../persistence/database"
import { registerWorkspaceRoutes } from "./workspace.routes"
import { makeCloneRepository } from "./workspace.git.node.adapters"
import {
  makeDeleteWorkspaceRow,
  makeFindWorkspaceByCanonicalPath,
  makeFindWorkspaceById,
  makeInsertWorkspace,
  makeListAllWorkspaces,
  makeListWorkspaces,
  makeTouchWorkspaceLastUsedAt,
  makeUpdateWorkspaceName,
} from "./workspace.sqlite.adapters"

export type AssembleWorkspaceSliceDeps = Readonly<{
  database: AgentDatabase
  canonicalizePath: CanonicalizePath
  readDirectoryEntries: ReadDirectoryEntries
  cloneRepository?: CloneRepository
  listLiveByWorkspaceRoot: ListLiveByWorkspaceRoot
  closeWorkspaceSessions: CloseWorkspaceSessions
  unbindWorkspaceSessions: UnbindWorkspaceSessions
}>

export type WorkspaceSlice = Readonly<{
  registerRoutes: (app: FastifyInstance) => void
  registerWorkspace: (body: CreateWorkspaceBody) => Promise<RegisterWorkspaceResult>
  findById: FindWorkspaceById
  listAll: ListAllWorkspaces
  deleteWorkspace: DeleteWorkspace
}>

export const assembleWorkspaceSlice = (deps: AssembleWorkspaceSliceDeps): WorkspaceSlice => {
  const insertWorkspace = makeInsertWorkspace(deps.database)
  const findWorkspaceById = makeFindWorkspaceById(deps.database)
  const findWorkspaceByCanonicalPath = makeFindWorkspaceByCanonicalPath(deps.database)
  const touchWorkspaceLastUsedAt = makeTouchWorkspaceLastUsedAt(deps.database)
  const listWorkspaces = makeListWorkspaces(deps.database)
  const listAllWorkspaces = makeListAllWorkspaces(deps.database)
  const updateWorkspaceName = makeUpdateWorkspaceName(deps.database)
  const deleteWorkspaceRow = makeDeleteWorkspaceRow(deps.database)

  const findOrCreateWorkspace = makeFindOrCreateWorkspace({
    findWorkspaceByCanonicalPath,
    insertWorkspace,
    touchWorkspaceLastUsedAt,
  })

  const registerWorkspace = makeRegisterWorkspace({
    canonicalizePath: deps.canonicalizePath,
    findOrCreateWorkspace,
    readDirectoryEntries: deps.readDirectoryEntries,
    cloneRepository: deps.cloneRepository ?? makeCloneRepository(),
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
