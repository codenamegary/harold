import { FastifyInstance, FastifyReply } from "fastify"
import { FindDeviceByCredentialHash, TouchDeviceLastSeen } from "core/device/ports"
import { authenticate } from "./authenticate"
import { authorizeActiveDevice } from "./authorize"
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
  findDeviceByCredentialHash: FindDeviceByCredentialHash
  touchDeviceLastSeen: TouchDeviceLastSeen
}

const sendUnauthorized = (reply: FastifyReply) =>
  reply
    .status(401)
    .header("WWW-Authenticate", BEARER_CHALLENGE)
    .type("application/problem+json")
    .send(buildUnauthorizedProblem())

const SESSIONS_STREAM_PATH = "/v1/sessions/stream"

const touchDeviceLastSeenForPrincipal = (params: {
  principal: Principal
  touchDeviceLastSeen: TouchDeviceLastSeen
}): void => {
  if (params.principal.kind !== "device") {
    return
  }

  params.touchDeviceLastSeen({
    deviceId: params.principal.deviceId,
    lastSeenAt: new Date().toISOString(),
  })
}

export const registerAuthMiddleware = (app: FastifyInstance, deps: AuthMiddlewareDeps) => {
  // preValidation so auth runs before route handshake / auto-resume work.
  app.addHook("preValidation", async (request, reply) => {
    const routerPath = request.routeOptions.url
    if (routerPath === undefined) {
      return
    }

    const authResult = authenticate({
      authorization: request.headers.authorization,
      lookupByCredentialHash: deps.findDeviceByCredentialHash,
    })

    setRequestPrincipal(request, authResult.principal)

    const rejectPresentedInvalid =
      authResult.credentialPresented && authResult.principal.kind === "unauthenticated"

    if (
      isOpenRoute({ method: request.method, routerPath }) ||
      routerPath === SESSIONS_STREAM_PATH
    ) {
      if (rejectPresentedInvalid) {
        return sendUnauthorized(reply)
      }
      touchDeviceLastSeenForPrincipal({
        principal: authResult.principal,
        touchDeviceLastSeen: deps.touchDeviceLastSeen,
      })
      return
    }

    if (!routerPath.startsWith("/v1/")) {
      return
    }

    if (!authorizeActiveDevice(authResult.principal)) {
      return sendUnauthorized(reply)
    }

    touchDeviceLastSeenForPrincipal({
      principal: authResult.principal,
      touchDeviceLastSeen: deps.touchDeviceLastSeen,
    })
  })
}
