import { EventStreamAuthFrameSchema } from "contracts/events/stream.auth"
import { WebSocket } from "ws"
import { authenticate, AuthenticateParams } from "./authenticate"
import { Principal } from "./principal"
import { websocketRawDataText } from "./websocket.raw.data.text"

export const DEFAULT_WS_AUTH_FRAME_TIMEOUT_MS = 5_000

type WaitForAuthFrameParams = {
  socket: WebSocket
  timeoutMs: number
  lookupByCredentialHash: AuthenticateParams["lookupByCredentialHash"]
}

export type WsAuthFrameResult =
  | { ok: true; principal: Principal }
  | { ok: false; reason: "timeout" | "invalid" | "closed" }

const authenticateAuthFrameMessage = (params: {
  data: WebSocket.RawData
  lookupByCredentialHash: AuthenticateParams["lookupByCredentialHash"]
}): WsAuthFrameResult => {
  const parsedJson: unknown = JSON.parse(websocketRawDataText(params.data))
  const frameResult = EventStreamAuthFrameSchema.safeParse(parsedJson)
  if (!frameResult.success) {
    return { ok: false, reason: "invalid" }
  }

  const authResult = authenticate({
    authorization: frameResult.data.authorization,
    lookupByCredentialHash: params.lookupByCredentialHash,
  })

  if (authResult.principal.kind === "unauthenticated") {
    return { ok: false, reason: "invalid" }
  }

  return { ok: true, principal: authResult.principal }
}

export const waitForAuthFrame = (params: WaitForAuthFrameParams): Promise<WsAuthFrameResult> =>
  new Promise((resolve) => {
    const { socket, timeoutMs, lookupByCredentialHash } = params
    const done = { current: false }

    const finish = (result: WsAuthFrameResult) => {
      if (done.current) {
        return
      }
      done.current = true
      clearTimeout(timer)
      socket.off("message", onMessage)
      socket.off("close", onClose)
      resolve(result)
    }

    const onClose = () => {
      finish({ ok: false, reason: "closed" })
    }

    const onMessage = (data: WebSocket.RawData) => {
      try {
        finish(authenticateAuthFrameMessage({ data, lookupByCredentialHash }))
      } catch {
        finish({ ok: false, reason: "invalid" })
      }
    }

    const timer = setTimeout(() => {
      finish({ ok: false, reason: "timeout" })
    }, timeoutMs)

    socket.on("message", onMessage)
    socket.on("close", onClose)
  })
