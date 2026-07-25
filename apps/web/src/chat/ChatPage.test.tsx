import { describe, expect, test } from "bun:test"
import { render, within } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { ChatPage } from "../shell/pages/ChatPage"

const renderChatPage = () =>
  render(
    <MemoryRouter>
      <ChatPage />
    </MemoryRouter>,
  )

describe("ChatPage", () => {
  test("renders page landmark and welcome copy", () => {
    const { getByRole, getByText } = renderChatPage()

    const main = getByRole("main")
    expect(within(main).getByRole("heading", { level: 1, name: "Agent playground" })).toBeInTheDocument()
    expect(getByRole("heading", { level: 3, name: "Test your ACP connection" })).toBeInTheDocument()
    expect(getByText("Send a prompt directly to an agent without leaving the console.")).toBeInTheDocument()
  })

  test("workspace and agent selects are empty and disabled", () => {
    const { getByLabelText } = renderChatPage()

    const workspaceSelect = getByLabelText("Workspace")
    const agentSelect = getByLabelText("Agent")

    expect(workspaceSelect).toBeDisabled()
    expect(agentSelect).toBeDisabled()
    expect(workspaceSelect.querySelectorAll("option")).toHaveLength(0)
    expect(agentSelect.querySelectorAll("option")).toHaveLength(0)
  })

  test("composer textarea and send button are disabled", () => {
    const { getByRole } = renderChatPage()

    expect(getByRole("textbox", { name: "Chat message" })).toBeDisabled()
    expect(getByRole("button", { name: "Send message" })).toBeDisabled()
  })

  test("slash menu and prompt chips are visible and disabled", () => {
    const { getByRole } = renderChatPage()

    expect(getByRole("menu", { name: "Slash commands" })).toBeInTheDocument()
    expect(getByRole("menuitem", { name: "/status Show workspace and git status" })).toBeDisabled()
    expect(getByRole("button", { name: "Summarize this workspace" })).toBeDisabled()
    expect(getByRole("button", { name: "Check the current git status" })).toBeDisabled()
    expect(getByRole("button", { name: "Find potential bugs" })).toBeDisabled()
  })

  test("clear chat button is disabled", () => {
    const { getByRole } = renderChatPage()

    expect(getByRole("button", { name: "Clear chat" })).toBeDisabled()
  })

  test("does not render simulated agent responses", () => {
    const { queryByText } = renderChatPage()

    expect(queryByText(/typing/i)).not.toBeInTheDocument()
    expect(queryByText(/assistant/i)).not.toBeInTheDocument()
  })
})
