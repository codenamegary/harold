import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { fireEvent, waitFor, within } from "@testing-library/react"
import { Route, Routes } from "react-router"
import { WorkspaceCollectionSchema } from "contracts/http/workspace"
import { renderWithProviders } from "../query/renderWithProviders"
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

const originalFetch = globalThis.fetch

const renderWorkspacesPage = (initialEntries = ["/workspaces"]) =>
  renderWithProviders(
    <Routes>
      <Route path="/workspaces" element={<WorkspacesPage />} />
    </Routes>,
    { initialEntries },
  )

describe("WorkspacesPage", () => {
  beforeEach(() => {
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = String(input)

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
      const url = String(input)

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
    expect(within(card).getByText("Available")).toBeInTheDocument()
    expect(getByText("1 of 1 workspaces")).toBeInTheDocument()
  })

  test("adds a workspace through the modal", async () => {
    const fetchMock = mock((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)

      if (url === "/v1/workspaces" && init?.method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              ...validWorkspace,
              name: "New Project",
              path: "/home/operator/new-project",
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

      return Promise.resolve(new Response("not found", { status: 404 }))
    })
    globalThis.fetch = fetchMock as typeof fetch

    const { getByRole, queryByRole } = renderWorkspacesPage()

    fireEvent.click(getByRole("button", { name: "+ Add workspace" }))

    const dialog = getByRole("dialog")
    fireEvent.change(within(dialog).getByLabelText("Name"), {
      target: { value: "New Project" },
    })
    fireEvent.change(within(dialog).getByLabelText("Path"), {
      target: { value: "/home/operator/new-project" },
    })
    fireEvent.click(within(dialog).getByRole("button", { name: "Add workspace" }))

    await waitFor(() => {
      expect(queryByRole("dialog")).not.toBeInTheDocument()
    })

    expect(fetchMock).toHaveBeenCalledWith(
      "/v1/workspaces",
      expect.objectContaining({
        method: "POST",
      }),
    )
  })

  test("searches workspaces through URL params", async () => {
    const fetchMock = mock((input: RequestInfo | URL) => {
      const url = String(input)

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
      const url = String(input)

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

    const { getByRole, getByText } = renderWorkspacesPage()

    fireEvent.click(getByRole("button", { name: "Missing" }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/v1/workspaces?limit=20&state=missing")
    })

    await waitFor(() => {
      expect(getByRole("article", { name: "agent-server workspace" })).toBeInTheDocument()
    })

    const card = getByRole("article", { name: "agent-server workspace" })
    expect(within(card).getByText("Missing")).toBeInTheDocument()
  })

  test("disables load more when next cursor is absent", async () => {
    globalThis.fetch = mock((input: RequestInfo | URL) => {
      const url = String(input)

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
})
