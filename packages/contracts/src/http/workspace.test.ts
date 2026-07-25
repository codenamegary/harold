import { describe, expect, test } from "bun:test";
import { WorkspaceSchema } from "./workspace";

const validWorkspace = {
  id: "ws-agent-server",
  name: "agent-server",
  path: "/home/operator/agent-server",
  state: "available",
  createdAt: "2026-07-24T12:00:00.000Z",
  lastUsedAt: "2026-07-24T12:05:00.000Z",
} as const;

describe("WorkspaceSchema", () => {
  test("accepts a valid workspace", () => {
    expect(WorkspaceSchema.parse(validWorkspace)).toEqual(validWorkspace);
  });

  test("rejects prototype agent count fields", () => {
    expect(() =>
      WorkspaceSchema.parse({ ...validWorkspace, agentCount: 1 }),
    ).toThrow();
  });

  test("rejects prototype additionalDirectories", () => {
    expect(() =>
      WorkspaceSchema.parse({
        ...validWorkspace,
        additionalDirectories: ["/tmp"],
      }),
    ).toThrow();
  });
});
