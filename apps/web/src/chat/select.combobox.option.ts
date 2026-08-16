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

/** Session title picker is a listbox button (not an editable combobox). */
export const sessionPickerButton = (queries: RoleQueries) =>
  queries.getByRole("button", { name: "Session" })

export const expectSessionPickerLabel = async (
  queries: RoleQueries,
  label: string,
) => {
  await waitFor(() => {
    const button = sessionPickerButton(queries)
    if (!button.textContent?.includes(label)) {
      throw new Error(
        `Session picker expected label ${label}, got ${button.textContent ?? ""}`,
      )
    }
  })
}

export const openSessionOptions = async (queries: RoleQueries) => {
  const user = userEvent.setup()
  await user.click(sessionPickerButton(queries))
  await waitFor(() => {
    queries.getByRole("listbox")
  })
}

export const selectSessionOption = async (
  queries: RoleQueries,
  optionLabel: string,
) => {
  const user = userEvent.setup()
  await openSessionOptions(queries)
  await user.click(queries.getByRole("option", { name: new RegExp(optionLabel) }))
  await expectSessionPickerLabel(queries, optionLabel)
}

/** Open the New session modal from the chat header button. */
export const openNewSessionModal = async (queries: RoleQueries) => {
  const user = userEvent.setup()
  await user.click(queries.getByRole("button", { name: "New session" }))

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

  await expectSessionPickerLabel(queries, "New session")
}

export const startNewSession = async (
  queries: RoleQueries,
  params: { workspaceName: string; agentName: string } = {
    workspaceName: "agent-server",
    agentName: "Cursor",
  },
) => {
  await waitFor(() => {
    if (sessionPickerButton(queries).hasAttribute("disabled")) {
      throw new Error("Session picker disabled")
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
    if (sessionPickerButton(queries).hasAttribute("disabled")) {
      throw new Error("Session picker disabled")
    }
  })
  await selectSessionOption(queries, sessionName)
}

export type NewSessionSelection = {
  workspaceId: string
  agentId: AgentId
}
