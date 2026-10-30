import { FastifyInstance } from "fastify"
import { Runtime } from "../runtime/runtime"

/**
 * Unauthenticated reachability probe. The body is deliberately minimal
 * (`LivenessSchema`): the daemon serves every interface, so this is the one
 * route any network neighbor can read. Runtime detail stays behind auth in
 * the daemon state file, which only the host can read.
 */
export const registerStatusRoutes = (app: FastifyInstance, runtime: Runtime) => {
  app.get("/v1/status", async (_request, reply) => {
    return reply.status(200).send({ state: runtime.getState(), version: runtime.version })
  })
}
