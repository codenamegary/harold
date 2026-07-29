import { describe, expect, test } from "bun:test"
import { render } from "@testing-library/react"
import { DevicesView } from "./DevicesView"

describe("DevicesView", () => {
  test("disables pair new device button", () => {
    const { getByRole } = render(<DevicesView />)

    expect(getByRole("button", { name: "+ Pair new device" })).toBeDisabled()
  })

  test("shows honest empty device summary counts", () => {
    const { getByText } = render(<DevicesView />)

    expect(getByText("0 devices online")).toBeInTheDocument()
    expect(getByText("of 0 paired")).toBeInTheDocument()
  })

  test("renders table headers without device rows or revoke controls", () => {
    const { getByText, queryByRole } = render(<DevicesView />)

    expect(getByText("DEVICE")).toBeInTheDocument()
    expect(getByText("LAST SEEN")).toBeInTheDocument()
    expect(getByText("LOCATION")).toBeInTheDocument()
    expect(getByText("STATUS")).toBeInTheDocument()
    expect(queryByRole("button", { name: /revoke/i })).not.toBeInTheDocument()
  })

  test("shows static danger note help text", () => {
    const { getByText } = render(<DevicesView />)

    expect(getByText("Lost a device?")).toBeInTheDocument()
    expect(
      getByText(
        "Revoking access immediately invalidates its credentials. The device can be paired again later.",
      ),
    ).toBeInTheDocument()
  })
})
