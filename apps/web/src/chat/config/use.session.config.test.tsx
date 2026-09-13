import { afterEach, describe, expect, mock, test } from "bun:test"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import React from "react"
import { selectionAtom } from "../selection/atoms"
import { renderWithProviders } from "../../query/render.with.providers"

import {
  configErrorBySessionAtom,
  pendingConfigBySessionAtom,
  sessionConfigBySessionAtom,
} from "./atoms"
import { useSessionConfig } from "./use.session.config"
import { ConfigOption } from "contracts/http/config-options"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

const modelOption = (currentValue: string): ConfigOption => ({
  id: "model",
  name: "Model",
  category: "model",
  type: "select",
  currentValue,
  options: [
    { value: "m1", name: "M1" },
    { value: "m2", name: "M2" },
  ],
})

const modeOption = (currentValue: string): ConfigOption => ({
  id: "mode",
  name: "Mode",
  category: "mode",
  type: "select",
  currentValue,
  options: [
    { value: "agent", name: "Agent" },
    { value: "ask", name: "Ask" },
  ],
})

const seedStore = () => {
  const store = createStore()
  store.set(selectionAtom, {
    workspaceId: "ws_01",
    agentId: "cursor",
    sessionId: "sess_01",
  })
  store.set(sessionConfigBySessionAtom, new Map([["sess_01", [modelOption("m1"), modeOption("agent")]]]))
  return store
}

describe("useSessionConfig", () => {
  test("resolves the reserved composer options for the selected session", () => {
    const store = seedStore()

    const { result } = renderHook(() => useSessionConfig(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    })

    expect(result.current.model?.id).toBe("model")
    expect(result.current.mode?.id).toBe("mode")
    expect(result.current.thinking).toBeUndefined()
  })

  test("setOption flips the pending overlay immediately and PUTs after the debounce", async () => {
    const store = seedStore()
    const fetchMock = mock(async () => new Response("", { status: 202 }))
    globalThis.fetch = fetchMock

    const Probe = () => {
      const config = useSessionConfig()
      return (
        <button
          type="button"
          onClick={() => config.setOption({ configId: "model", value: "m2" })}
        >
          set
        </button>
      )
    }

    const { getByRole, jotaiStore } = renderWithProviders(<Probe />, {
      jotaiStore: store,
    })

    act(() => {
      getByRole("button", { name: "set" }).click()
    })

    expect(jotaiStore.get(pendingConfigBySessionAtom).get("sess_01")).toEqual({
      configId: "model",
      value: "m2",
    })

    await waitFor(
      () => {
        expect(fetchMock).toHaveBeenCalledTimes(1)
      },
      { timeout: 4_000 },
    )

    const [url, init] = (fetchMock.mock.calls[0] ?? []) as [string, RequestInit]
    expect(url).toBe("/v1/sessions/sess_01/config-options/model?agentId=cursor")
    expect(init.method).toBe("PUT")
    expect(JSON.parse(init.body as string)).toEqual({ value: "m2" })
  })

  test("a failed PUT rolls the pending set back and surfaces the error", async () => {
    const store = seedStore()
    const fetchMock = mock(async () => new Response(JSON.stringify({
      type: "https://agent-server.local/problems/validation-error",
      title: "Config option rejected",
      status: 422,
      detail: "Config option rejected",
      code: "validation.configOption.invalid",
      errors: [],
    }), { status: 422 }))
    globalThis.fetch = fetchMock

    const Probe = () => {
      const config = useSessionConfig()
      return (
        <button
          type="button"
          onClick={() => config.setOption({ configId: "model", value: "m2" })}
        >
          set
        </button>
      )
    }

    const { getByRole, jotaiStore } = renderWithProviders(<Probe />, {
      jotaiStore: store,
    })

    act(() => {
      getByRole("button", { name: "set" }).click()
    })

    await new Promise((resolve) => setTimeout(resolve, 2200))
    expect(jotaiStore.get(configErrorBySessionAtom).get("sess_01")).toBe(
      "Config option rejected",
    )
    expect(jotaiStore.get(pendingConfigBySessionAtom).size).toBe(0)
    expect(jotaiStore.get(sessionConfigBySessionAtom).get("sess_01")).toEqual([
      modelOption("m1"),
      modeOption("agent"),
    ])
  })
})
