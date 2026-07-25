import { describe, expect, test } from "bun:test";
import { StatusSchema } from "./status";

const validStatus = {
  version: "0.1.0",
  state: "online",
  bindAddress: "127.0.0.1",
  port: 3847,
  startedAt: "2026-07-24T12:00:00.000Z",
  uptimeSeconds: 42,
  acp: {
    state: "stopped",
    activeSessions: 0,
  },
} as const;

describe("StatusSchema", () => {
  test("accepts a valid MS1 status payload", () => {
    expect(StatusSchema.parse(validStatus)).toEqual(validStatus);
  });

  test("rejects non-loopback bind addresses", () => {
    expect(() =>
      StatusSchema.parse({ ...validStatus, bindAddress: "0.0.0.0" }),
    ).toThrow();
  });

  test("rejects prototype connection mode fields", () => {
    expect(() =>
      StatusSchema.parse({ ...validStatus, connectionMode: "local" }),
    ).toThrow();
  });
});
