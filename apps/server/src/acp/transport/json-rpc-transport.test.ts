import { describe, expect, test } from "bun:test"
import { isAcpJsonRpcError, readSafeJsonRpcErrorData } from "./json-rpc-error"
import { createJsonRpcTransport } from "./json-rpc-transport"

describe("createJsonRpcTransport", () => {
  test("sends notifications without id and does not wait for a response", async () => {
    const written: string[] = []
    const stdin = { write: (chunk: string) => written.push(chunk) }
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()
    const transport = createJsonRpcTransport({ stdin, stdout: readable })

    transport.notify("session/cancel", { sessionId: "sess-1" })

    expect(written).toHaveLength(1)
    expect(JSON.parse(written[0]?.trim() ?? "{}")).toEqual({
      jsonrpc: "2.0",
      method: "session/cancel",
      params: { sessionId: "sess-1" },
    })

    await writer.close()
    transport.close()
  })

  test("correlates request and response by id", async () => {
    const written: string[] = []
    const stdin = {
      write: (chunk: string) => {
        written.push(chunk)
      },
    }

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()
    const transport = createJsonRpcTransport({
      stdin,
      stdout: readable,
    })

    const responsePromise = transport.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {},
    })

    const requestLine = written[0]
    expect(requestLine?.endsWith("\n")).toBe(true)
    const request = JSON.parse(requestLine ?? "{}") as {
      jsonrpc: string
      id: number
      method: string
    }
    expect(request.jsonrpc).toBe("2.0")
    expect(request.method).toBe("initialize")

    await writer.write(
      new TextEncoder().encode(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: { protocolVersion: 1 },
        })}\n`,
      ),
    )

    expect(responsePromise).resolves.toEqual({ protocolVersion: 1 })
    await writer.close()
    transport.close()
  })

  test("dispatches notifications to registered handlers", async () => {
    const written: string[] = []
    const stdin = { write: (chunk: string) => written.push(chunk) }
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()

    const transport = createJsonRpcTransport({
      stdin,
      stdout: readable,
    })

    const notifications: unknown[] = []
    transport.onNotification("session/update", (params) => {
      notifications.push(params)
    })

    await writer.write(
      new TextEncoder().encode(
        `${JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: { sessionId: "sess-1", update: { kind: "text" } },
        })}\n`,
      ),
    )

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(notifications).toEqual([{ sessionId: "sess-1", update: { kind: "text" } }])
    expect(written).toHaveLength(0)

    await writer.close()
    transport.close()
  })

  test("handles inbound agent requests and responds with results", async () => {
    const written: string[] = []
    const stdin = { write: (chunk: string) => written.push(chunk) }
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()
    const transport = createJsonRpcTransport({ stdin, stdout: readable })

    transport.onRequest("session/request_permission", async ({ id }) => {
      transport.respond(id, {
        outcome: { outcome: "selected", optionId: "allow-once" },
      })
    })

    await writer.write(
      new TextEncoder().encode(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 99,
          method: "session/request_permission",
          params: { sessionId: "sess-1" },
        })}\n`,
      ),
    )

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(JSON.parse(written[0]?.trim() ?? "{}")).toEqual({
      jsonrpc: "2.0",
      id: 99,
      result: {
        outcome: { outcome: "selected", optionId: "allow-once" },
      },
    })

    await writer.close()
    transport.close()
  })

  test("rejects requests when the transport receives a JSON-RPC error", async () => {
    const stdin = { write: () => undefined }
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()
    const transport = createJsonRpcTransport({ stdin, stdout: readable })

    const responsePromise = transport.request("authenticate", { methodId: "cursor_login" })

    await writer.write(
      new TextEncoder().encode(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32000, message: "auth failed" },
        })}\n`,
      ),
    )

    expect(responsePromise).rejects.toThrow("auth failed")
    await writer.close()
    transport.close()
  })

  test("preserves safe JSON-RPC error.data on inbound error responses", async () => {
    const stdin = { write: () => undefined }
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
    const writer = writable.getWriter()
    const transport = createJsonRpcTransport({ stdin, stdout: readable })

    const responsePromise = transport.request("session/load", {
      sessionId: "missing",
      cwd: "/tmp",
      mcpServers: [],
    })

    await writer.write(
      new TextEncoder().encode(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          error: {
            code: -32602,
            message: "Invalid params",
            data: { message: 'Session "missing" not found' },
          },
        })}\n`,
      ),
    )

    try {
      await responsePromise
      throw new Error("expected request to reject")
    } catch (error: unknown) {
      expect(isAcpJsonRpcError(error)).toBe(true)
      if (!isAcpJsonRpcError(error)) {
        return
      }
      expect(error.message).toBe("Invalid params")
      expect(error.code).toBe(-32602)
      expect(error.data).toEqual({ message: 'Session "missing" not found' })
    }

    await writer.close()
    transport.close()
  })

  test("drops unsafe JSON-RPC error.data values", () => {
    expect(readSafeJsonRpcErrorData({ message: "ok" })).toEqual({ message: "ok" })
    expect(readSafeJsonRpcErrorData(() => "secret")).toBeUndefined()
    expect(readSafeJsonRpcErrorData({ nested: { fn: () => 1 } })).toBeUndefined()
    expect(readSafeJsonRpcErrorData(Symbol("x"))).toBeUndefined()
  })
})
