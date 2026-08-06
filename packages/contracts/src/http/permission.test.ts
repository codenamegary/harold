import { describe, expect, test } from "bun:test"
import {
  ListSessionPermissionsQuerySchema,
  PermissionRequestSchema,
  ResolvePermissionRequestBodySchema,
} from "./permission"

describe("permission contracts", () => {
  test("parses a pending permission request", () => {
    expect(
      PermissionRequestSchema.parse({
        id: "perm-1",
        sessionId: "sess-1",
        turnId: "turn_01KZBHZYTYC67MG8E03KCY6NY0",
        toolCallId: "tool-1",
        toolName: "fake-tool",
        status: "pending",
        options: [{ optionId: "allow-once", name: "Allow once", kind: "allow" }],
        createdAt: "2026-08-06T12:00:00.000Z",
      }),
    ).toMatchObject({ status: "pending" })
  })

  test("parses list query with pending filter", () => {
    expect(ListSessionPermissionsQuerySchema.parse({ status: "pending" })).toEqual({
      status: "pending",
    })
  })

  test("parses resolve body", () => {
    expect(
      ResolvePermissionRequestBodySchema.parse({
        status: "resolved",
        optionId: "allow-once",
      }),
    ).toEqual({ status: "resolved", optionId: "allow-once" })
  })
})
