import { afterEach, describe, expect, test } from "bun:test"
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React, { useState } from "react"
import { Combobox, ComboboxOptionItem } from "./Combobox"

afterEach(() => {
  cleanup()
})

const options: ReadonlyArray<ComboboxOptionItem> = [
  { value: "ws_a", label: "Alpha", description: "/tmp/alpha" },
  { value: "ws_b", label: "Beta", description: "/tmp/beta" },
  { value: "ws_c", label: "Gamma" },
]

const Harness: React.FC<{
  filter?: "client" | "external"
  onQueryChange?: (query: string) => void
  disabled?: boolean
}> = ({ filter = "client", onQueryChange, disabled }) => {
  const [value, setValue] = useState("")

  return (
    <Combobox
      label="Workspace"
      aria-label="Workspace"
      value={value}
      onChange={setValue}
      options={options}
      filter={filter}
      onQueryChange={onQueryChange}
      disabled={disabled}
      placeholder="Select…"
    />
  )
}

describe("Combobox", () => {
  test("opens options and selects a value", async () => {
    const user = userEvent.setup()
    const { getByRole } = render(<Harness />)
    const input = getByRole("combobox", { name: "Workspace" })

    await user.click(input)
    await user.type(input, "Alpha")
    await user.keyboard("{ArrowDown}{Enter}")

    await waitFor(() => {
      expect(input).toHaveAttribute("aria-expanded", "false")
    })
    await waitFor(() => {
      expect(input).toHaveValue("Alpha")
    })
  })

  test("filters options as the user types", async () => {
    const user = userEvent.setup()
    const { getByRole, queryByRole } = render(<Harness />)
    const input = getByRole("combobox", { name: "Workspace" })

    await user.click(input)
    await user.type(input, "bet")

    await waitFor(() => {
      expect(getByRole("option", { name: /Beta/ })).toBeInTheDocument()
    })
    expect(queryByRole("option", { name: /Alpha/ })).not.toBeInTheDocument()
    expect(queryByRole("option", { name: /Gamma/ })).not.toBeInTheDocument()
  })

  test("calls onQueryChange in external filter mode", async () => {
    const user = userEvent.setup()
    const queries: string[] = []
    const { getByRole } = render(
      <Harness
        filter="external"
        onQueryChange={(query) => {
          queries.push(query)
        }}
      />,
    )

    const input = getByRole("combobox", { name: "Workspace" })
    await user.click(input)
    await user.type(input, "agent")

    await waitFor(() => {
      expect(queries).toContain("agent")
    })
  })

  test("does not open when disabled", () => {
    const { getByRole, queryByRole } = render(<Harness disabled />)

    fireEvent.click(getByRole("button", { name: "Toggle Workspace options" }))

    expect(queryByRole("option", { name: /Alpha/ })).not.toBeInTheDocument()
  })
})
