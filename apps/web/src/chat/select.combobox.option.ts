import { waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AgentId } from "contracts/http/agent-settings"
import { clearChatSelection } from "./chat.selection.storage"

type RoleQueries = {
  getByRole: (
    role: string,
    options?: { name?: string | RegExp },
  ) => HTMLElement
}

export const clearChatTestSelection = () => {
  clearChatSelection()
}

/** Select a combobox option via typeahead + Enter (reliable under happy-dom). */
export const selectComboboxOption = async (
  queries: RoleQueries,
  comboboxName: string,
  optionLabel: string,
) => {
  const user = userEvent.setup()
  const input = queries.getByRole("combobox", { name: comboboxName }) as HTMLInputElement
  await user.click(input)
  await user.clear(input)
  await user.type(input, optionLabel)
  await user.keyboard("{ArrowDown}{Enter}")

  await waitFor(() => {
    if (input.getAttribute("aria-expanded") !== "false") {
      throw new Error(`${comboboxName} combobox still open`)
    }
  })

  await waitFor(() => {
    if (input.value !== optionLabel) {
      throw new Error(
        `${comboboxName} expected value ${optionLabel}, got ${input.value}`,
      )
    }
  })
}

export const openComboboxOptions = async (
  queries: RoleQueries,
  comboboxName = "Session",
) => {
  const user = userEvent.setup()
  await user.click(
    queries.getByRole("button", { name: `Toggle ${comboboxName} options` }),
  )
  await waitFor(() => {
    queries.getByRole("listbox")
  })
}

/** Open the New session modal from the session picker. */
export const openNewSessionModal = async (queries: RoleQueries) => {
  const user = userEvent.setup()
  const input = queries.getByRole("combobox", { name: "Session" })
  await user.click(input)
  await user.clear(input)
  await user.type(input, "New session")
  await user.keyboard("{ArrowDown}{Enter}")

  await waitFor(() => {
    queries.getByRole("dialog", { name: "New session" })
  })
}

/** Configure workspace + agent in the open New session modal and continue. */
export const confirmNewSessionModal = async (
  queries: RoleQueries,
  params: { workspaceName: string; agentName: string },
) => {
  const user = userEvent.setup()
  await selectComboboxOption({ getByRole: queries.getByRole }, "Workspace", params.workspaceName)
  await selectComboboxOption({ getByRole: queries.getByRole }, "Agent", params.agentName)
  await user.click(queries.getByRole("button", { name: "Continue" }))

  await waitFor(() => {
    const input = queries.getByRole("combobox", { name: "Session" }) as HTMLInputElement
    if (input.value !== "New session") {
      throw new Error(`expected New session, got ${input.value}`)
    }
  })
}

export const startNewSession = async (
  queries: RoleQueries,
  params: { workspaceName: string; agentName: string } = {
    workspaceName: "agent-server",
    agentName: "Cursor",
  },
) => {
  await waitFor(() => {
    const input = queries.getByRole("combobox", { name: "Session" })
    if ((input as HTMLInputElement).disabled) {
      throw new Error("Session combobox disabled")
    }
  })
  await openNewSessionModal(queries)
  await confirmNewSessionModal(queries, params)
}

export const joinSessionByName = async (
  queries: RoleQueries,
  sessionName: string,
) => {
  await waitFor(() => {
    const input = queries.getByRole("combobox", { name: "Session" })
    if ((input as HTMLInputElement).disabled) {
      throw new Error("Session combobox disabled")
    }
  })
  await selectComboboxOption(queries, "Session", sessionName)
}

export type NewSessionSelection = {
  workspaceId: string
  agentId: AgentId
}
