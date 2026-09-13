import { describe, expect, test } from "bun:test"
import { createStore } from "jotai"
import { selectionAtom } from "../selection/atoms"
import {
  availableCommandsAtom,
  pendingPromptAtom,
  permissionAtom,
  transcriptAtom,
} from "./atoms"
import { sessionConfigBySessionAtom } from "../config/atoms"
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

  test("keeps available commands out of the transcript", () => {
    const store = storeOnSession()

    store.set(applyStreamMessageAtom, {
      type: "session_update",
      agentId: "cursor",
      sessionId: "sess_01",
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [{ name: "plan", description: "Draft a plan" }],
      },
    })

    expect(store.get(availableCommandsAtom)).toEqual([
      { name: "plan", description: "Draft a plan" },
    ])
    expect(store.get(transcriptAtom).rows).toEqual([])
  })

  test("ignores available commands for a different session", () => {
    const store = storeOnSession()

    store.set(applyStreamMessageAtom, {
      type: "session_update",
      agentId: "cursor",
      sessionId: "sess_other",
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: [{ name: "plan", description: "Draft a plan" }],
      },
    })

    expect(store.get(availableCommandsAtom)).toEqual([])
  })

  test("replaces the whole list when the agent sends a new one", () => {
    const store = storeOnSession()
    const send = (commands: ReadonlyArray<{ name: string; description: string }>) => {
      store.set(applyStreamMessageAtom, {
        type: "session_update",
        agentId: "cursor",
        sessionId: "sess_01",
        update: {
          sessionUpdate: "available_commands_update",
          availableCommands: commands,
        },
      })
    }

    send([{ name: "plan", description: "Draft a plan" }])
    send([{ name: "test", description: "Run tests" }])

    expect(store.get(availableCommandsAtom)).toEqual([
      { name: "test", description: "Run tests" },
    ])
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
    store.set(pendingPromptAtom, { text: "ship it" })

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
    store.set(pendingPromptAtom, { text: "ship it" })

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
    store.set(pendingPromptAtom, { text: "ship it" })

    const effect = store.set(applyStreamMessageAtom, {
      type: "subscribed",
      agentId: "cursor",
      sessionId: "sess_other",
    })

    expect(effect).toEqual({ kind: "none" })
    expect(store.get(pendingPromptAtom)).toEqual({ text: "ship it" })
  })
})

const modelOption = (currentValue: string) => ({
  id: "model",
  name: "Model",
  category: "model",
  type: "select" as const,
  currentValue,
  options: [
    { value: "m1", name: "M1" },
    { value: "m2", name: "M2" },
  ],
})

describe("stream actions session_config", () => {
  test("replaces the whole config array for the selected session", () => {
    const store = storeOnSession()

    store.set(applyStreamMessageAtom, {
      type: "session_config",
      agentId: "cursor",
      sessionId: "sess_01",
      configOptions: [modelOption("m1")],
    })

    expect(store.get(sessionConfigBySessionAtom).get("sess_01")).toEqual([
      modelOption("m1"),
    ])
  })

  test("ignores session_config for a different session", () => {
    const store = storeOnSession()

    store.set(applyStreamMessageAtom, {
      type: "session_config",
      agentId: "cursor",
      sessionId: "sess_other",
      configOptions: [modelOption("m1")],
    })

    expect(store.get(sessionConfigBySessionAtom).size).toBe(0)
  })
})
