import { describe, expect, test } from "bun:test";
import { SessionSchema } from "./session";

const validSession = {
  id: "session-auth",
  workspaceId: "ws-agent-server",
  name: "Auth flow",
  state: "idle",
  createdAt: "2026-07-24T12:00:00.000Z",
  lastUsedAt: "2026-07-24T12:05:00.000Z",
  archivedAt: null,
} as const;

describe("SessionSchema", () => {
  test("accepts a valid session", () => {
    expect(SessionSchema.parse(validSession)).toEqual(validSession);
  });

  test("rejects prototype agent vocabulary", () => {
    expect(() =>
      SessionSchema.parse({ ...validSession, agentId: "agent-auth" }),
    ).toThrow();
  });

  test("rejects internal acpSessionId", () => {
    expect(() =>
      SessionSchema.parse({
        ...validSession,
        acpSessionId: "acp-session-1",
      }),
    ).toThrow();
  });
});
