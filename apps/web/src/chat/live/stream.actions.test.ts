import { describe, expect, test } from "bun:test"
import { createStore } from "jotai"
import { selectionAtom } from "../selection/atoms"
import { pendingPromptAtom, permissionAtom, transcriptAtom } from "./atoms"
import { applyStreamMessageAtom } from "./stream.actions"

const storeOnSession = () => {
  const store = createStore()
  store.set(selectionAtom, {
    workspaceId: "ws_01",
    agentId: "cursor",
    sessionId: "sess_01",
  })
  return store
}

describe("stream actions", () => {
  test("folds a matching session_update into the transcript", () => {
    const store = storeOnSession()

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
    const store = storeOnSession()

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
    const store = storeOnSession()

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

  test("asks the caller to send a queued prompt once subscribed", () => {
    const store = storeOnSession()
    store.set(pendingPromptAtom, "ship it")

    const effect = store.set(applyStreamMessageAtom, {
      type: "subscribed",
      agentId: "cursor",
      sessionId: "sess_01",
    })

    expect(effect).toEqual({
      kind: "send-prompt",
      agentId: "cursor",
      sessionId: "sess_01",
      text: "ship it",
    })
    expect(store.get(pendingPromptAtom)).toBeNull()
  })

  test("does not resend a queued prompt on a second subscribe", () => {
    const store = storeOnSession()
    store.set(pendingPromptAtom, "ship it")

    store.set(applyStreamMessageAtom, {
      type: "subscribed",
      agentId: "cursor",
      sessionId: "sess_01",
    })
    const second = store.set(applyStreamMessageAtom, {
      type: "subscribed",
      agentId: "cursor",
      sessionId: "sess_01",
    })

    expect(second).toEqual({ kind: "none" })
  })

  test("keeps a queued prompt when another session subscribes", () => {
    const store = storeOnSession()
    store.set(pendingPromptAtom, "ship it")

    const effect = store.set(applyStreamMessageAtom, {
      type: "subscribed",
      agentId: "cursor",
      sessionId: "sess_other",
    })

    expect(effect).toEqual({ kind: "none" })
    expect(store.get(pendingPromptAtom)).toBe("ship it")
  })
})
