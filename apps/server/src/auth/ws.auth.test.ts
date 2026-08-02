import { describe, expect, test } from "bun:test"
import { EventStreamAuthFrameSchema } from "contracts/events/stream-auth"
import { WebSocket, WebSocketServer } from "ws"
import { hashDeviceCredential } from "../device/hash.device.credential"
import { waitForAuthFrame } from "./ws.auth"

describe("EventStreamAuthFrameSchema", () => {
  test("accepts Bearer authorization string", () => {
    const frame = EventStreamAuthFrameSchema.parse({
      type: "auth",
      authorization: "Bearer secret",
    })
    expect(frame.authorization).toBe("Bearer secret")
  })
})

describe("waitForAuthFrame", () => {
  test("resolves device principal from valid auth frame", async () => {
    const server = new WebSocketServer({ port: 0 })
    const address = server.address()
    if (address === null || typeof address === "string") {
      throw new Error("expected bound address")
    }

    const credential = "devcred_ws_frame"
    const credentialHash = hashDeviceCredential(credential)

    const resultPromise = new Promise<Awaited<ReturnType<typeof waitForAuthFrame>>>(
      (resolve) => {
        server.on("connection", (socket) => {
          void waitForAuthFrame({
            socket,
            timeoutMs: 1_000,
            lookupByCredentialHash: (hash) =>
              hash === credentialHash
                ? { id: "device_ws", revokedAt: null }
                : undefined,
          }).then(resolve)
        })
      },
    )

    const client = new WebSocket(`ws://127.0.0.1:${address.port}`)
    await new Promise<void>((resolve) => {
      client.on("open", () => {
        client.send(
          JSON.stringify({
            type: "auth",
            authorization: `Bearer ${credential}`,
          }),
        )
        resolve()
      })
    })

    const result = await resultPromise
    expect(result).toEqual({
      ok: true,
      principal: { kind: "device", deviceId: "device_ws" },
    })

    client.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  test("invalid frame fails closed", async () => {
    const server = new WebSocketServer({ port: 0 })
    const address = server.address()
    if (address === null || typeof address === "string") {
      throw new Error("expected bound address")
    }

    const resultPromise = new Promise<Awaited<ReturnType<typeof waitForAuthFrame>>>(
      (resolve) => {
        server.on("connection", (socket) => {
          void waitForAuthFrame({
            socket,
            timeoutMs: 1_000,
            lookupByCredentialHash: () => undefined,
          }).then(resolve)
        })
      },
    )

    const client = new WebSocket(`ws://127.0.0.1:${address.port}`)
    await new Promise<void>((resolve) => {
      client.on("open", () => {
        client.send(JSON.stringify({ type: "auth", authorization: "Bearer bad" }))
        resolve()
      })
    })

    const result = await resultPromise
    expect(result).toEqual({ ok: false, reason: "invalid" })

    client.close()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
})
