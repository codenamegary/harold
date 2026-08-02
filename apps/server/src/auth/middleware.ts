import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { DeviceRepository } from "../device/repository"
import { authenticate } from "./authenticate"
import { authorizeActiveFullOperator } from "./authorize"
import { isLoopbackRequest } from "./loopback"
import { BEARER_CHALLENGE, buildUnauthorizedProblem } from "./problems"
import { Principal } from "./principal"
import { isOpenRoute } from "./route.policy"

const principals = new WeakMap<object, Principal>()

export const getRequestPrincipal = (request: object): Principal | undefined =>
  principals.get(request)

export const setRequestPrincipal = (request: object, principal: Principal): void => {
  principals.set(request, principal)
}

export type AuthMiddlewareDeps = {
  deviceRepository: DeviceRepository
  isLoopbackRequest?: (request: FastifyRequest) => boolean
}

const sendUnauthorized = (reply: FastifyReply) =>
  reply
    .status(401)
    .header("WWW-Authenticate", BEARER_CHALLENGE)
    .type("application/problem+json")
    .send(buildUnauthorizedProblem())

const EVENTS_PATH = "/v1/events"

const touchDeviceLastSeen = (params: {
  principal: Principal
  deviceRepository: DeviceRepository
}): void => {
  if (params.principal.kind !== "device") {
    return
  }

  params.deviceRepository.touchLastSeen({
    deviceId: params.principal.deviceId,
    lastSeenAt: new Date().toISOString(),
  })
}

export const registerAuthMiddleware = (
  app: FastifyInstance,
  deps: AuthMiddlewareDeps,
) => {
  const resolveLoopback = deps.isLoopbackRequest ?? isLoopbackRequest

  // preValidation so auth runs before route handshake / auto-resume work.
  app.addHook("preValidation", async (request, reply) => {
    const routerPath = request.routeOptions.url
    if (routerPath === undefined) {
      return
    }

    const authResult = authenticate({
      authorization: request.headers.authorization,
      isLoopback: resolveLoopback(request),
      lookupByCredentialHash: (credentialHash) =>
        deps.deviceRepository.getByCredentialHash({ credentialHash }),
    })

    setRequestPrincipal(request, authResult.principal)

    const rejectPresentedInvalid =
      authResult.credentialPresented &&
      authResult.principal.kind === "unauthenticated"

    if (isOpenRoute({ method: request.method, routerPath }) || routerPath === EVENTS_PATH) {
      if (rejectPresentedInvalid) {
        return sendUnauthorized(reply)
      }
      touchDeviceLastSeen({
        principal: authResult.principal,
        deviceRepository: deps.deviceRepository,
      })
      return
    }

    if (!routerPath.startsWith("/v1/")) {
      return
    }

    if (!authorizeActiveFullOperator(authResult.principal)) {
      return sendUnauthorized(reply)
    }

    touchDeviceLastSeen({
      principal: authResult.principal,
      deviceRepository: deps.deviceRepository,
    })
  })
}
