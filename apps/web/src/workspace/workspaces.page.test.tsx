import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { fireEvent, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Route, Routes } from "react-router"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { renderWithProviders } from "../query/render.with.providers"
import { requestUrl } from "../test/request.url"
import { WorkspacesPage } from "../shell/pages/WorkspacesPage"

const validWorkspace = {
  id: "ws-agent-server",
  name: "agent-server",
  path: "/home/operator/agent-server",
  state: "available",
  createdAt: "2026-07-24T12:00:00.000Z",
  lastUsedAt: "2026-07-24T12:05:00.000Z",
} as const

const emptyCollection = WorkspaceCollectionSchema.parse({
  items: [],
  page: { limit: 20, count: 0 },
})

const listCollection = WorkspaceCollectionSchema.parse({
  items: [validWorkspace],
  page: { limit: 20, count: 1 },
})

const allowedRoot = "/home/operator/code"

const wrapRuntimeSettings = (allowedRoots: string[]) => ({
  settings: {
    advertisedUrl: null,
    advertisedUrlEnabled: true,
    trustedProxies: [] as string[],
    bindHost: "127.0.0.1" as const,
    bindPort: 3847,
    logLevel: "info" as const,
    logPath: null as string | null,
    allowedRoots,
  },
  restartRequired: false,
  effective: {
    bindHost: "127.0.0.1" as const,
    bindPort: 3847,
    logPath: null as string | null,
  },
  overrides: {},
})

const originalFetch = globalThis.fetch

const comboboxIn = (dialog: HTMLElement, name: string): HTMLInputElement | null => {
  const input = within(dialog).queryByRole("combobox", { name })
  if (!(input instanceof HTMLInputElement)) {
    return null
  }
  return input
}

const requireEnabledCombobox = (dialog: HTMLElement, name: string): HTMLInputElement => {
  const input = comboboxIn(dialog, name)
  if (input === null) {
    throw new Error(`${name} combobox missing`)
  }
  if (input.disabled) {
    throw new Error(`${name} combobox still disabled`)
  }
  return input
}

const pickComboboxOption = async (
  dialog: HTMLElement,
  name: string,
  optionLabel: string,
) => {
  const user = userEvent.setup()
  const input = requireEnabledCombobox(dialog, name)
  await user.click(input)
  await user.clear(input)
  await user.type(input, optionLabel)
  await user.keyboard("{ArrowDown}{Enter}")
  await waitFor(() => {
    if (input.value !== optionLabel) {
      throw new Error(`${name} expected ${optionLabel}, got ${input.value}`)
    }
  })
}

const renderWorkspacesPage = (initialEntries = ["/workspaces"]) =>
  renderWithProviders(
    <Routes>
      <Route path="/workspaces" element={<WorkspacesPage />} />
      <Route path="/settings" element={<div>Settings page</div>} />
    </Routes>,
    { initialEntries },
  )

describe("WorkspacesPage", () => {
  beforeEach(() => {
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = requestUrl(input)

      if (url.startsWith("/v1/workspaces")) {
        return Promise.resolve(
          new Response(JSON.stringify(emptyCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("renders page intro with description", async () => {
    const { getByText } = renderWorkspacesPage()

    expect(getByText("Control which projects and agents are exposed through ACP.")).toBeInTheDocument()

    await waitFor(() => {
      expect(getByText("No workspaces registered yet.")).toBeInTheDocument()
    })
  })

  test("lists workspace cards from the API", async () => {
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = requestUrl(input)

      if (url.startsWith("/v1/workspaces")) {
        return Promise.resolve(
          new Response(JSON.stringify(listCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch

    const { getByRole, getByText } = renderWorkspacesPage()

    await waitFor(() => {
      expect(getByRole("article", { name: "agent-server workspace" })).toBeInTheDocument()
    })

    const card = getByRole("article", { name: "agent-server workspace" })

    expect(within(card).getByText("/home/operator/agent-server")).toBeInTheDocument()
    expect(within(card).getByLabelText("Available")).toHaveClass("bg-lime")
    expect(getByText("1 of 1 workspaces")).toBeInTheDocument()
  })

  test("adds a workspace through root and folder pickers", async () => {
    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)

      if (url === "/v1/workspaces" && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ...validWorkspace,
              name: "new-project",
              path: `${allowedRoot}/new-project`,
            }),
            {
              status: 201,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      if (url.startsWith("/v1/workspaces")) {
        return Promise.resolve(
          new Response(JSON.stringify(emptyCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith("/v1/settings/runtime")) {
        return Promise.resolve(
          new Response(JSON.stringify(wrapRuntimeSettings([allowedRoot])), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith("/v1/filesystem/directories")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                { name: "new-project", path: `${allowedRoot}/new-project` },
                { name: "other", path: `${allowedRoot}/other` },
              ],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    const { getByRole, queryAllByRole } = renderWorkspacesPage()

    fireEvent.click(getByRole("button", { name: "+ Add workspace" }))

    const dialog = getByRole("dialog")
    expect(within(dialog).queryAllByLabelText("Path")).toHaveLength(0)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/v1\/settings\/runtime/),
      )
    })
    await waitFor(() => {
      requireEnabledCombobox(dialog, "Root")
    })
    await pickComboboxOption(dialog, "Root", allowedRoot)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/v1\/filesystem\/directories\?/),
      )
    })
    await waitFor(() => {
      requireEnabledCombobox(dialog, "Folder")
    })
    await pickComboboxOption(dialog, "Folder", "new-project")

    const nameInput = within(dialog).queryByLabelText("Name")
    if (!(nameInput instanceof HTMLInputElement)) {
      throw new Error("Name input missing")
    }
    await waitFor(() => {
      if (nameInput.value !== "new-project") {
        throw new Error(`Name expected new-project, got ${nameInput.value}`)
      }
    })

    fireEvent.click(within(dialog).getByRole("button", { name: "Add workspace" }))

    await waitFor(() => {
      expect(queryAllByRole("dialog")).toHaveLength(0)
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/workspaces",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          name: "new-project",
          path: `${allowedRoot}/new-project`,
        }),
      }),
    )
  }, 30_000)

  test("links to Settings when no allowed roots are configured", async () => {
    const fetchMock = mock((input: RequestInfo | URL) => {
      const url = requestUrl(input)

      if (url.startsWith("/v1/workspaces")) {
        return Promise.resolve(
          new Response(JSON.stringify(emptyCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith("/v1/settings/runtime")) {
        return Promise.resolve(
          new Response(JSON.stringify(wrapRuntimeSettings([])), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    const { getByRole, getByText } = renderWorkspacesPage()

    fireEvent.click(getByRole("button", { name: "+ Add workspace" }))

    const dialog = getByRole("dialog")
    await waitFor(() => {
      expect(within(dialog).getByRole("status")).toHaveTextContent(
        "Add an allowed root in Settings before creating a workspace.",
      )
    })

    fireEvent.click(within(dialog).getByRole("link", { name: "Settings" }))

    await waitFor(() => {
      expect(getByText("Settings page")).toBeInTheDocument()
    })
  }, 10_000)

  test("searches workspaces through URL params", async () => {
    const fetchMock = mock((input: RequestInfo | URL) => {
      const url = requestUrl(input)

      if (url.includes("q=agent")) {
        return Promise.resolve(
          new Response(JSON.stringify(listCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      if (url.startsWith("/v1/workspaces")) {
        return Promise.resolve(
          new Response(JSON.stringify(emptyCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    const { getByRole } = renderWorkspacesPage(["/workspaces?q=agent"])

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/v1/workspaces?limit=20&q=agent")
    })

    await waitFor(() => {
      expect(getByRole("article", { name: "agent-server workspace" })).toBeInTheDocument()
    })

    fireEvent.change(getByRole("searchbox", { name: "Search workspaces" }), {
      target: { value: "agent" },
    })

    expect(getByRole("searchbox", { name: "Search workspaces" })).toHaveValue("agent")
  })

  test("filters workspaces by state through URL params", async () => {
    const fetchMock = mock((input: RequestInfo | URL) => {
      const url = requestUrl(input)

      if (url.includes("state=missing")) {
        return Promise.resolve(
          new Response(
            JSON.stringify(
              WorkspaceCollectionSchema.parse({
                items: [{ ...validWorkspace, state: "missing" }],
                page: { limit: 20, count: 1 },
              }),
            ),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      if (url.startsWith("/v1/workspaces")) {
        return Promise.resolve(
          new Response(JSON.stringify(emptyCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    const { getByRole } = renderWorkspacesPage()

    fireEvent.click(getByRole("button", { name: "Missing" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/v1/workspaces?limit=20&state=missing")
    })

    await waitFor(() => {
      expect(getByRole("article", { name: "agent-server workspace" })).toBeInTheDocument()
    })

    const card = getByRole("article", { name: "agent-server workspace" })
    expect(within(card).getByLabelText("Missing")).toHaveClass("bg-amber")
  })

  test("disables load more when next cursor is absent", async () => {
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = requestUrl(input)

      if (url.startsWith("/v1/workspaces")) {
        return Promise.resolve(
          new Response(JSON.stringify(listCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    }) as typeof fetch

    const { getByRole } = renderWorkspacesPage()

    await waitFor(() => {
      expect(getByRole("button", { name: "Load more" })).toBeDisabled()
    })
  })

  test("shows list fetch errors", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response("server error", {
          status: 500,
        }),
      ),
    ) as typeof fetch

    const { getByRole } = renderWorkspacesPage()

    await waitFor(() => {
      expect(getByRole("alert")).toHaveTextContent("Could not load workspaces.")
    })
  })

  test("renames a workspace inline", async () => {
    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)

      if (url === "/v1/workspaces/ws-agent-server" && init?.method === "PATCH") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ...validWorkspace,
              name: "Renamed Project",
              lastUsedAt: "2026-07-24T12:10:00.000Z",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      if (url.startsWith("/v1/workspaces")) {
        return Promise.resolve(
          new Response(JSON.stringify(listCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    const { getByRole } = renderWorkspacesPage()

    await waitFor(() => {
      expect(getByRole("article", { name: "agent-server workspace" })).toBeInTheDocument()
    })

    fireEvent.click(getByRole("button", { name: "Rename agent-server" }))
    const renameInput = getByRole("textbox", { name: "Rename agent-server" })
    fireEvent.change(renameInput, {
      target: { value: "Renamed Project" },
    })

    await waitFor(() => {
      expect(renameInput).toHaveValue("Renamed Project")
    })

    fireEvent.submit(renameInput.closest("form")!)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/v1/workspaces/ws-agent-server",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "Renamed Project" }),
        }),
      )
    })
  })

  test("shows rename errors on the card", async () => {
    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)

      if (url === "/v1/workspaces/ws-agent-server" && init?.method === "PATCH") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              type: "https://agent-server.local/problems/not-found",
              title: "Workspace not found",
              detail: "Unknown workspace id.",
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      if (url.startsWith("/v1/workspaces")) {
        return Promise.resolve(
          new Response(JSON.stringify(listCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    const { getByRole } = renderWorkspacesPage()

    await waitFor(() => {
      expect(getByRole("article", { name: "agent-server workspace" })).toBeInTheDocument()
    })

    fireEvent.click(getByRole("button", { name: "Rename agent-server" }))
    const renameInput = getByRole("textbox", { name: "Rename agent-server" })
    fireEvent.change(renameInput, {
      target: { value: "Missing Workspace" },
    })

    await waitFor(() => {
      expect(renameInput).toHaveValue("Missing Workspace")
    })

    fireEvent.submit(renameInput.closest("form")!)

    await waitFor(() => {
      expect(getByRole("alert")).toHaveTextContent("Unknown workspace id.")
    })
  })

  test("unregisters a workspace after confirmation", async () => {
    const emptyAfterDelete = WorkspaceCollectionSchema.parse({
      items: [],
      page: { limit: 20, count: 0 },
    })
    const deleted = { value: false }

    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)

      if (url === "/v1/workspaces/ws-agent-server" && init?.method === "DELETE") {
        deleted.value = true
        return Promise.resolve(new Response(null, { status: 204 }))
      }

      if (url.startsWith("/v1/workspaces")) {
        return Promise.resolve(
          new Response(JSON.stringify(deleted.value ? emptyAfterDelete : listCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    const { getByRole, queryByRole } = renderWorkspacesPage()

    await waitFor(() => {
      expect(getByRole("article", { name: "agent-server workspace" })).toBeInTheDocument()
    })

    fireEvent.click(getByRole("button", { name: "Unregister agent-server" }))
    const dialog = getByRole("dialog")
    fireEvent.click(within(dialog).getByRole("button", { name: "Unregister" }))

    await waitFor(() => {
      expect(queryByRole("dialog")).not.toBeInTheDocument()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/workspaces/ws-agent-server",
      expect.objectContaining({
        method: "DELETE",
      }),
    )
  }, 15000)

  test("shows unregister errors in the modal", async () => {
    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input)

      if (url === "/v1/workspaces/ws-agent-server" && init?.method === "DELETE") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              type: "https://agent-server.local/problems/not-found",
              title: "Workspace not found",
              detail: "Unknown workspace id.",
            }),
            {
              status: 404,
              headers: { "Content-Type": "application/json" },
            },
          ),
        )
      }

      if (url.startsWith("/v1/workspaces")) {
        return Promise.resolve(
          new Response(JSON.stringify(listCollection), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        )
      }

      return Promise.resolve(new Response("not found", { status: 404 }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    const { getByRole } = renderWorkspacesPage()

    await waitFor(() => {
      expect(getByRole("article", { name: "agent-server workspace" })).toBeInTheDocument()
    })

    fireEvent.click(getByRole("button", { name: "Unregister agent-server" }))
    fireEvent.click(getByRole("button", { name: "Unregister" }))

    await waitFor(() => {
      expect(getByRole("dialog")).toHaveTextContent("Unknown workspace id.")
    })
  })
})
