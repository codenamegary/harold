import { ListLogsQuerySchema, LogCollectionSchema, LOGS_PATH } from "contracts/http/logs"
import { FastifyInstance } from "fastify"
import { ClearLogs, QueryLogs } from "./logs.ports"

export type RegisterLogRoutesDeps = Readonly<{
  queryLogs: QueryLogs
  clearLogs: ClearLogs
}>

export const registerLogRoutes = (app: FastifyInstance, deps: RegisterLogRoutesDeps) => {
  app.get(LOGS_PATH, { logLevel: "silent" }, async (request, reply) => {
    const query = ListLogsQuerySchema.parse(request.query)
    const listed = deps.queryLogs(query)
    if (!listed.ok) {
      return reply.status(400).send({
        type: "about:blank",
        title: "Invalid log query",
        status: 400,
        detail: `Invalid log query: ${listed.error.kind}`,
      })
    }
    const collection = LogCollectionSchema.parse({
      items: listed.value.items,
      page: {
        limit: listed.value.limit,
        count: listed.value.count,
      },
    })
    return reply.status(200).send(collection)
  })

  app.delete(LOGS_PATH, { logLevel: "silent" }, async (_request, reply) => {
    deps.clearLogs()
    return reply.status(204).send()
  })
}
