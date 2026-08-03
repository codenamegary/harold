import {
  CONNECTION_TEST_PATH,
  ConnectionTestResponseSchema,
} from "contracts/http/connection-test"
import { FastifyInstance } from "fastify"
import { ConnectionTestService } from "./connection.test.service"
import {
  buildConnectionTestFailedProblem,
  buildMissingAdvertisedUrlProblem,
} from "./problems"

const sendProblem = (
  reply: {
    status: (code: number) => {
      type: (type: string) => { send: (body: unknown) => unknown }
    }
  },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

export const registerConnectionTestRoutes = (
  app: FastifyInstance,
  service: ConnectionTestService,
) => {
  app.post(CONNECTION_TEST_PATH, async (_request, reply) => {
    const result = await service.run()

    if (!result.ok) {
      if (result.error.kind === "missing_advertised_url") {
        return sendProblem(reply, 400, buildMissingAdvertisedUrlProblem())
      }

      return sendProblem(reply, 500, buildConnectionTestFailedProblem())
    }

    return reply.status(200).send(ConnectionTestResponseSchema.parse(result.value))
  })
}
