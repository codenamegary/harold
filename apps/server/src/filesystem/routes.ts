import {
  FilesystemDirectoryCollectionSchema,
  ListFilesystemDirectoriesQuerySchema,
} from "contracts/http/filesystem.browse"
import { FastifyInstance } from "fastify"
import {
  buildRootNotAllowedProblem,
  buildRootPathValidationProblem,
} from "./filesystem.browse.problems"
import { listDirectories } from "./filesystem.list.directories"

const sendProblem = (
  reply: { status: (code: number) => { type: (type: string) => { send: (body: unknown) => unknown } } },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

export const registerFilesystemBrowseRoutes = (
  app: FastifyInstance,
  getAllowedRoots: () => readonly string[],
) => {
  app.get("/v1/filesystem/directories", async (request, reply) => {
    const query = ListFilesystemDirectoriesQuerySchema.parse(request.query)
    const result = listDirectories({
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
