import {
  CreateFilesystemDirectoryBodySchema,
  FILESYSTEM_DIRECTORIES_PATH,
  FilesystemDirectoryCollectionSchema,
  FilesystemDirectoryCreatedSchema,
  ListFilesystemDirectoriesQuerySchema,
} from "contracts/http/filesystem.browse"
import { makeCreateDirectory } from "core/filesystem/create.directory.usecase"
import { FastifyInstance } from "fastify"
import { sendProblem } from "../error/send.problem"
import {
  makeCanonicalizePath,
  makeCreateDirectory as makeCreateDirectoryAdapter,
  makeGetHomeDirectory,
  makeReadDirectoryEntries,
  makeStatPath,
} from "./filesystem.node.adapters"
import { makeListDirectories } from "./filesystem.list.directories.usecase"
import {
  buildDirectoryAlreadyExistsProblem,
  buildInvalidDirectoryNameProblem,
  buildParentNotWritableProblem,
  buildParentPathValidationProblem,
  buildRootPathValidationProblem,
} from "./filesystem.browse.problems"

export const registerFilesystemBrowseRoutes = (app: FastifyInstance) => {
  const listDirectories = makeListDirectories({
    canonicalizePath: makeCanonicalizePath(),
    readDirectoryEntries: makeReadDirectoryEntries(),
    statPath: makeStatPath(),
    getHomeDirectory: makeGetHomeDirectory(),
  })
  const createDirectory = makeCreateDirectory({
    canonicalizePath: makeCanonicalizePath(),
    createDirectory: makeCreateDirectoryAdapter(),
  })

  app.get(FILESYSTEM_DIRECTORIES_PATH, async (request, reply) => {
    const query = ListFilesystemDirectoriesQuerySchema.parse(request.query)
    const result = await listDirectories({ root: query.root })

    if (!result.ok) {
      return sendProblem(reply, 400, buildRootPathValidationProblem(result.error.error))
    }

    return reply.status(200).send(FilesystemDirectoryCollectionSchema.parse(result.value))
  })

  app.post(FILESYSTEM_DIRECTORIES_PATH, async (request, reply) => {
    const body = CreateFilesystemDirectoryBodySchema.parse(request.body)
    const result = await createDirectory(body)

    if (!result.ok) {
      switch (result.error.kind) {
        case "path":
          return sendProblem(reply, 400, buildParentPathValidationProblem(result.error.error))
        case "invalid_name":
          return sendProblem(reply, 400, buildInvalidDirectoryNameProblem())
        case "already_exists":
          return sendProblem(reply, 409, buildDirectoryAlreadyExistsProblem())
        case "permission_denied":
          return sendProblem(reply, 400, buildParentNotWritableProblem())
      }
    }

    return reply.status(201).send(FilesystemDirectoryCreatedSchema.parse(result.value))
  })
}
