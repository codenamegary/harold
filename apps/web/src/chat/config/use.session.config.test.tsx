import { afterEach, describe, expect, mock, test } from "bun:test"
import { QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import React from "react"
import { selectionAtom } from "../selection/atoms"
import { createTestQueryClient } from "../../query/create.test.query.client"
import { sessionConfigBySessionAtom } from "./atoms"
import { useSessionConfig } from "./use.session.config"
import { ConfigOption } from "contracts/http/config.options"

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
  store.set(
    sessionConfigBySessionAtom,
    new Map([["sess_01", [modelOption("m1"), modeOption("agent")]]]),
  )
  return store
}

const renderSessionConfigHook = (store: ReturnType<typeof createStore>) =>
  renderHook(() => useSessionConfig(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={createTestQueryClient()}>
        <Provider store={store}>{children}</Provider>
      </QueryClientProvider>
    ),
  })

describe("useSessionConfig", () => {
  test("resolves the reserved composer options for the selected session", () => {
    const store = seedStore()

    const { result } = renderSessionConfigHook(store)

    expect(result.current.model?.id).toBe("model")
    expect(result.current.mode?.id).toBe("mode")
    expect(result.current.thinking).toBeUndefined()
  })

  test("setOption flips the config value optimistically and PUTs immediately", async () => {
    const store = seedStore()
    const fetchMock = mock(async () => new Response("", { status: 202 }))
    globalThis.fetch = fetchMock

    const { result } = renderSessionConfigHook(store)

    act(() => {
      result.current.setOption({ configId: "model", value: "m2" })
    })

    expect(
      store
        .get(sessionConfigBySessionAtom)
        .get("sess_01")
        ?.find((option) => option.id === "model")?.currentValue,
    ).toBe("m2")

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    const [url, init] = (fetchMock.mock.calls[0] ?? []) as [string, RequestInit]
    expect(url).toBe("/v1/sessions/sess_01/config-options/model?agentId=cursor")
    expect(init.method).toBe("PUT")
    expect(JSON.parse(init.body as string)).toEqual({ value: "m2" })
  })

  test("a failed PUT rolls the value back and surfaces the error detail", async () => {
    const store = seedStore()
    const fetchMock = mock(
      async () =>
        new Response(
          JSON.stringify({
            type: "https://harold.local/problems/validation-error",
            title: "Config option rejected",
            status: 422,
            detail: "Config option rejected",
            code: "validation.configOption.invalid",
            errors: [],
          }),
          { status: 422 },
        ),
    )
    globalThis.fetch = fetchMock

    const { result } = renderSessionConfigHook(store)

    act(() => {
      result.current.setOption({ configId: "model", value: "m2" })
    })

    await waitFor(() => {
      expect(result.current.error).toBe("Config option rejected")
    })

    expect(store.get(sessionConfigBySessionAtom).get("sess_01")).toEqual([
      modelOption("m1"),
      modeOption("agent"),
    ])
  })

  test("saving is true only while the PUT is in flight", async () => {
    const store = seedStore()
    let release: (() => void) | undefined
    globalThis.fetch = mock(
      () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response("", { status: 202 }))
        }),
    )

    const { result } = renderSessionConfigHook(store)

    expect(result.current.saving).toBe(false)

    act(() => {
      result.current.setOption({ configId: "model", value: "m2" })
    })

    await waitFor(() => {
      expect(result.current.saving).toBe(true)
    })

    act(() => {
      release?.()
    })

    await waitFor(() => {
      expect(result.current.saving).toBe(false)
    })
  })

  test("a new set aborts the in-flight PUT", async () => {
    const store = seedStore()
    const signals: AbortSignal[] = []
    const releases: Array<() => void> = []
    globalThis.fetch = mock(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          signals.push(init?.signal ?? new AbortController().signal)
          releases.push(() => resolve(new Response("", { status: 202 })))
        }),
    )

    const { result } = renderSessionConfigHook(store)

    act(() => {
      result.current.setOption({ configId: "model", value: "m2" })
    })
    await waitFor(() => {
      expect(result.current.saving).toBe(true)
    })

    act(() => {
      result.current.setOption({ configId: "mode", value: "ask" })
    })

    await waitFor(() => {
      expect(signals[0]?.aborted).toBe(true)
    })
    expect(signals).toHaveLength(2)

    act(() => {
      for (const release of releases) {
        release()
      }
    })

    await waitFor(() => {
      expect(result.current.saving).toBe(false)
    })
  })
})
