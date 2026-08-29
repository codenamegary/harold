import { describe, expect, test } from "bun:test"
import { createStore } from "jotai"
import { selectionAtom } from "../selection/atoms"
import { emptyAcpTranscript } from "./acp.transcript.reducer"
import { clearLiveAtom, resetLiveAtom } from "./actions"
import { pendingPromptAtom, permissionAtom, transcriptAtom } from "./atoms"
import { applyStreamMessageAtom } from "./stream.actions"

const storeWithLiveState = () => {
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
  return store
}

describe("live actions", () => {
  test("clearLive drops the transcript and overlays", () => {
    const store = storeWithLiveState()

    store.set(clearLiveAtom, emptyAcpTranscript)

    expect(store.get(transcriptAtom).rows).toEqual([])
    expect(store.get(permissionAtom)).toBeNull()
  })

  test("clearLive keeps a queued prompt so a reconnect can deliver it", () => {
    const store = storeWithLiveState()
    store.set(pendingPromptAtom, "ship it")

    store.set(clearLiveAtom, emptyAcpTranscript)

    expect(store.get(pendingPromptAtom)).toBe("ship it")
  })

  test("resetLive also drops the queued prompt", () => {
    const store = storeWithLiveState()
    store.set(pendingPromptAtom, "ship it")

    store.set(resetLiveAtom)

    expect(store.get(transcriptAtom).rows).toEqual([])
    expect(store.get(pendingPromptAtom)).toBeNull()
  })
})
