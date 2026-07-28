import { describe, expect, test } from "bun:test"
import { createAcpPermissionHandler } from "./permission"

describe("createAcpPermissionHandler", () => {
  test("auto-selects allow-once when available", async () => {
    const handlers = createAcpPermissionHandler()

    await expect(handlers["session/request_permission"]({
      sessionId: "sess-1",
      options: [
        { optionId: "reject-once", name: "Reject once" },
        { optionId: "allow-once", name: "Allow once" },
      ],
    })).resolves.toEqual({
      outcome: {
        outcome: "selected",
        optionId: "allow-once",
      },
    })
  })

  test("fails when no permissive option exists", async () => {
    const handlers = createAcpPermissionHandler()

    await expect(handlers["session/request_permission"]({
      sessionId: "sess-1",
      options: [{ optionId: "reject-once", name: "Reject once" }],
    })).rejects.toMatchObject({
      message: "no permissive permission option available",
    })
  })
})
