import Fastify, { FastifyInstance } from "fastify"
import { z } from "zod"
import { registerErrorHandler } from "../error/error-handler"
import { Config } from "../config/config"
import { AgentDatabase } from "../persistence/open-database"
import { Runtime } from "../runtime/runtime"
import { registerStatusRoutes } from "../status/status-routes"
import { createAgentSettingsRepository } from "../agent-settings/agent-settings-repository"
import { registerAgentSettingsRoutes } from "../agent-settings/agent-settings-routes"
import { createWorkspaceRepository } from "../workspace/workspace-repository"
import { registerWorkspaceRoutes } from "../workspace/workspace-routes"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { ValidateExecutablePathFn } from "../agent-settings/validate-agent-path"

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
  database: AgentDatabase
  registerTestRoutes?: boolean
  whichFn?: WhichFn
  validateExecutablePathFn?: ValidateExecutablePathFn
}

export const createServer = async ({
  config,
  runtime,
  database,
  registerTestRoutes: withTestRoutes = false,
  whichFn,
  validateExecutablePathFn,
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
  registerWorkspaceRoutes(app, createWorkspaceRepository(database))
  registerAgentSettingsRoutes(
    app,
    createAgentSettingsRepository(database, { whichFn, validateExecutablePathFn }),
  )

  if (withTestRoutes) {
    registerTestRoutes(app)
  }

  return app
}
