import { describe, expect, test } from "bun:test"
import {
  composerBlockedMessage,
  isComposerPromptable,
  resolveEffectiveSessionState,
} from "./chat.promptability"
import { sessionStatusDotVariant } from "./session.status.dot.variant"

describe("chat promptability", () => {
  test("new session stays promptable with workspace and agent", () => {
    expect(
      isComposerPromptable({
        workspaceId: "ws_01",
        agentId: "cursor",
        sessionId: "",
        sessionState: null,
      }),
    ).toBe(true)
  })

  test("existing idle session is promptable", () => {
    expect(
      isComposerPromptable({
        workspaceId: "ws_01",
        agentId: "cursor",
        sessionId: "sess_01",
        sessionState: "idle",
      }),
    ).toBe(true)
  })

  test("running offline and error sessions are not promptable", () => {
    const base = {
      workspaceId: "ws_01",
      agentId: "cursor",
      sessionId: "sess_01",
    }

    expect(isComposerPromptable({ ...base, sessionState: "running" })).toBe(false)
    expect(isComposerPromptable({ ...base, sessionState: "awaiting-permission" })).toBe(false)
    expect(isComposerPromptable({ ...base, sessionState: "offline" })).toBe(false)
    expect(isComposerPromptable({ ...base, sessionState: "error" })).toBe(false)
  })

  test("blocked copy distinguishes offline from terminal error", () => {
    expect(composerBlockedMessage("offline")).toBe(
      "Session reconnecting. Prompts unlock when it is idle again.",
    )
    expect(composerBlockedMessage("error")).toBe(
      "Session ended with an error. Start a new session to continue.",
    )
    expect(composerBlockedMessage("running")).toBeNull()
    expect(composerBlockedMessage("awaiting-permission")).toBe(
      "Waiting for permission. Answer above to continue.",
    )
    expect(composerBlockedMessage("idle")).toBeNull()
  })

  test("effective session state prefers transcript over list", () => {
    expect(
      resolveEffectiveSessionState({
        sessionId: "sess_01",
        transcriptSessionState: "running",
        listSessionState: "idle",
      }),
    ).toBe("running")
  })

  test("session status dot maps idle running offline and error", () => {
    expect(sessionStatusDotVariant("idle")).toBe("online")
    expect(sessionStatusDotVariant("running")).toBe("warning")
    expect(sessionStatusDotVariant("awaiting-permission")).toBe("warning")
    expect(sessionStatusDotVariant("offline")).toBe("offline")
    expect(sessionStatusDotVariant("error")).toBe("offline")
    expect(sessionStatusDotVariant("starting")).toBeNull()
  })
})
