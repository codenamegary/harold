import {
  ListLogsQuerySchema,
  LogCollectionSchema,
  LOGS_PATH,
} from "contracts/http/logs"
import { FastifyInstance } from "fastify"
import { LogBuffer } from "./log.buffer"

export const registerLogRoutes = (app: FastifyInstance, logBuffer: LogBuffer) => {
  app.get(
    LOGS_PATH,
    { logLevel: "silent" },
    async (request, reply) => {
      const query = ListLogsQuerySchema.parse(request.query)
      const listed = logBuffer.list(query)
      const collection = LogCollectionSchema.parse({
        items: listed.items,
        page: {
          limit: listed.limit,
          count: listed.count,
        },
      })
      return reply.status(200).send(collection)
    },
  )

  app.delete(LOGS_PATH, { logLevel: "silent" }, async (_request, reply) => {
    logBuffer.clear()
    return reply.status(204).send()
  })
}
