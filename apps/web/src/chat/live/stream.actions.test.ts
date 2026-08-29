import { describe, expect, test } from "bun:test"
import { createStore } from "jotai"
import { selectionAtom } from "../selection/atoms"
import { permissionAtom, transcriptAtom } from "./atoms"
import { emptyAcpTranscript } from "./acp.transcript.reducer"
import { applyStreamMessageAtom, clearLiveAtom } from "./stream.actions"

describe("stream actions", () => {
  test("folds a matching session_update into the transcript", () => {
    const store = createStore()
    store.set(selectionAtom, {
      workspaceId: "ws_01",
      agentId: "cursor",
      sessionId: "sess_01",
    })

    store.set(applyStreamMessageAtom, {
      type: "session_update",
      agentId: "cursor",
      sessionId: "sess_01",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hello" },
      },
    })

    expect(store.get(transcriptAtom).rows).toEqual([
      {
        kind: "assistant",
        turnId: "replay",
        text: "Hello",
      },
    ])
  })

  test("ignores session_update for a different session", () => {
    const store = createStore()
    store.set(selectionAtom, {
      workspaceId: "ws_01",
      agentId: "cursor",
      sessionId: "sess_01",
    })

    store.set(applyStreamMessageAtom, {
      type: "session_update",
      agentId: "cursor",
      sessionId: "sess_other",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hello" },
      },
    })

    expect(store.get(transcriptAtom).rows).toEqual([])
  })

  test("stores a matching permission request", () => {
    const store = createStore()
    store.set(selectionAtom, {
      workspaceId: "ws_01",
      agentId: "cursor",
      sessionId: "sess_01",
    })

    store.set(applyStreamMessageAtom, {
      type: "permission_request",
      requestId: "req-1",
      agentId: "cursor",
      sessionId: "sess_01",
      params: {
        options: [{ optionId: "allow-once", name: "Allow once" }],
        toolCall: { name: "edit" },
      },
    })

    expect(store.get(permissionAtom)).toEqual({
      requestId: "req-1",
      toolName: "edit",
      options: [{ optionId: "allow-once", name: "Allow once" }],
    })
    expect(store.get(transcriptAtom).sessionState).toBe("awaiting-permission")
  })

  test("clearLive resets transcript and overlays", () => {
    const store = createStore()
    store.set(selectionAtom, {
      workspaceId: "ws_01",
      agentId: "cursor",
      sessionId: "sess_01",
    })
    store.set(applyStreamMessageAtom, {
      type: "session_update",
      agentId: "cursor",
      sessionId: "sess_01",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "Hello" },
      },
    })

    store.set(clearLiveAtom, emptyAcpTranscript)

    expect(store.get(transcriptAtom).rows).toEqual([])
    expect(store.get(permissionAtom)).toBeNull()
  })
})
