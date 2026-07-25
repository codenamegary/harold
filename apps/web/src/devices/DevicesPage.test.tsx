import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { DevicesPage } from "../shell/pages/DevicesPage"

describe("DevicesPage", () => {
  test("renders disabled pair action and empty device state", () => {
    const { getByRole, getByText, queryByRole } = render(<DevicesPage />)

    expect(getByRole("button", { name: "+ Pair new device" })).toBeDisabled()
    expect(getByText("0 devices online")).toBeInTheDocument()
    expect(getByText("of 0 paired")).toBeInTheDocument()
    expect(getByText("DEVICE")).toBeInTheDocument()
    expect(queryByRole("button", { name: /revoke/i })).not.toBeInTheDocument()
  })
})
