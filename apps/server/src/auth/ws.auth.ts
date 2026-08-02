import { EventStreamAuthFrameSchema } from "contracts/events/stream-auth"
import { WebSocket } from "ws"
import { authenticate, AuthenticateParams } from "./authenticate"
import { Principal } from "./principal"

export const DEFAULT_WS_AUTH_FRAME_TIMEOUT_MS = 5_000

type WaitForAuthFrameParams = {
  socket: WebSocket
  timeoutMs: number
  lookupByCredentialHash: AuthenticateParams["lookupByCredentialHash"]
}

export type WsAuthFrameResult =
  | { ok: true; principal: Principal }
  | { ok: false; reason: "timeout" | "invalid" | "closed" }

export const waitForAuthFrame = (
  params: WaitForAuthFrameParams,
): Promise<WsAuthFrameResult> =>
  new Promise((resolve) => {
    const { socket, timeoutMs, lookupByCredentialHash } = params
    let settled = false

    const finish = (result: WsAuthFrameResult) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      socket.off("message", onMessage)
      socket.off("close", onClose)
      resolve(result)
    }

    const onClose = () => {
      finish({ ok: false, reason: "closed" })
    }

    const onMessage = (data: WebSocket.RawData) => {
      const parsedJson: unknown = (() => {
        try {
          return JSON.parse(String(data))
        } catch {
          return undefined
        }
      })()

      const frameResult = EventStreamAuthFrameSchema.safeParse(parsedJson)
      if (!frameResult.success) {
        finish({ ok: false, reason: "invalid" })
        return
      }

      const authResult = authenticate({
        authorization: frameResult.data.authorization,
        isLoopback: false,
        lookupByCredentialHash,
      })

      if (authResult.principal.kind === "unauthenticated") {
        finish({ ok: false, reason: "invalid" })
        return
      }

      finish({ ok: true, principal: authResult.principal })
    }

    const timer = setTimeout(() => {
      finish({ ok: false, reason: "timeout" })
    }, timeoutMs)

    socket.on("message", onMessage)
    socket.on("close", onClose)
  })
