import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { WorkspacesPage } from "../shell/pages/WorkspacesPage"

const renderWorkspacesPage = () =>
  render(
    <MemoryRouter initialEntries={["/workspaces"]}>
      <WorkspacesPage />
    </MemoryRouter>,
  )

describe("WorkspacesPage", () => {
  test("renders page intro with description", () => {
    const { getByText } = renderWorkspacesPage()

    expect(getByText("Control which projects and agents are exposed through ACP.")).toBeInTheDocument()
  })

  test("add workspace button is disabled", () => {
    const { getByRole } = renderWorkspacesPage()

    const addButton = getByRole("button", { name: "+ Add workspace" })
    expect(addButton).toBeDisabled()
  })

  test("search control is disabled", () => {
    const { getByRole } = renderWorkspacesPage()

    const search = getByRole("searchbox", { name: "Search workspaces" })
    expect(search).toBeDisabled()
  })

  test("filter controls are disabled", () => {
    const { getByRole } = renderWorkspacesPage()

    expect(getByRole("button", { name: "All" })).toBeDisabled()
    expect(getByRole("button", { name: "Active" })).toBeDisabled()
    expect(getByRole("button", { name: "Paused" })).toBeDisabled()
  })

  test("shows empty state with no workspace cards", () => {
    const { getByText, queryByRole } = renderWorkspacesPage()

    expect(getByText("No workspaces registered yet.")).toBeInTheDocument()
    expect(queryByRole("article")).not.toBeInTheDocument()
  })

  test("does not render add workspace modal", () => {
    const { queryByRole } = renderWorkspacesPage()

    expect(queryByRole("dialog")).not.toBeInTheDocument()
  })
})
