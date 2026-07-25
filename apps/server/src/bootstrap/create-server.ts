import Fastify, { FastifyInstance } from "fastify"
import { z } from "zod"
import { registerErrorHandler } from "../error/error-handler"
import { Config } from "../config/config"
import { Runtime } from "../runtime/runtime"
import { registerStatusRoutes } from "../status/status-routes"

const TestBodySchema = z.object({
  name: z.string().min(1),
})

export const registerTestRoutes = (app: FastifyInstance) => {
  app.post("/v1/_test/validate", async (request) => {
    TestBodySchema.parse(request.body)
    return { ok: true }
  })

  app.get("/v1/_test/error", async () => {
    throw new Error("Test internal error")
  })
}

export type CreateServerOptions = {
  config: Config
  runtime: Runtime
  registerTestRoutes?: boolean
}

export const createServer = async ({
  config,
  runtime,
  registerTestRoutes: withTestRoutes = false,
}: CreateServerOptions) => {
  const app = Fastify({
    logger: {
      level: "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['x-api-key']",
        ],
        remove: true,
      },
    },
  })

  registerErrorHandler(app)
  registerStatusRoutes(app, runtime, config)

  if (withTestRoutes) {
    registerTestRoutes(app)
  }

  return app
}
