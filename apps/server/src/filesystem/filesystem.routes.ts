import {
  FilesystemDirectoryCollectionSchema,
  ListFilesystemDirectoriesQuerySchema,
} from "contracts/http/filesystem.browse"
import { FastifyInstance } from "fastify"
import { sendProblem } from "../error/send.problem"
import {
  makeCanonicalizePath,
  makeReadDirectoryEntries,
  makeStatPath,
} from "./filesystem.node.adapters"
import { makeListDirectories } from "./filesystem.list.directories.usecase"
import {
  buildRootNotAllowedProblem,
  buildRootPathValidationProblem,
} from "./filesystem.browse.problems"

export const registerFilesystemBrowseRoutes = (
  app: FastifyInstance,
  getAllowedRoots: () => readonly string[],
) => {
  const listDirectories = makeListDirectories({
    canonicalizePath: makeCanonicalizePath(),
    readDirectoryEntries: makeReadDirectoryEntries(),
    statPath: makeStatPath(),
  })

  app.get("/v1/filesystem/directories", async (request, reply) => {
    const query = ListFilesystemDirectoriesQuerySchema.parse(request.query)
    const result = await listDirectories({
      root: query.root,
      allowedRoots: getAllowedRoots(),
    })

    if (!result.ok) {
      if (result.error.kind === "not_allowed") {
        return sendProblem(reply, 400, buildRootNotAllowedProblem())
      }
      return sendProblem(reply, 400, buildRootPathValidationProblem(result.error.error))
    }

    return reply.status(200).send(
      FilesystemDirectoryCollectionSchema.parse({
        items: result.items,
      }),
    )
  })
}
