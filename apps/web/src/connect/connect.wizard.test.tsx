import { describe, expect, test } from "bun:test"
import { fireEvent, render, within } from "@testing-library/react"
import { ConnectWizard } from "./ConnectWizard"

const stepRailLabels = [
  /access mode/i,
  /external url/i,
  /test connection/i,
  /pair device/i,
] as const

describe("ConnectWizard", () => {
  test("renders four navigable step rail buttons", () => {
    const { getByRole } = render(<ConnectWizard />)

    stepRailLabels.forEach((label) => {
      expect(getByRole("button", { name: label })).toBeInTheDocument()
    })
  })

  test("starts on access mode step", () => {
    const { getByRole } = render(<ConnectWizard />)

    expect(getByRole("heading", { name: /how will you connect/i })).toBeInTheDocument()
    expect(getByRole("status", { name: "Wizard progress" })).toHaveTextContent("1 / 4")
  })

  test("navigates between steps via step rail", () => {
    const { getByRole } = render(<ConnectWizard />)

    fireEvent.click(getByRole("button", { name: /external url/i }))
    expect(getByRole("heading", { name: /configure external access/i })).toBeInTheDocument()
    expect(getByRole("status", { name: "Wizard progress" })).toHaveTextContent("2 / 4")

    fireEvent.click(getByRole("button", { name: /test connection/i }))
    expect(getByRole("heading", { name: /test your connection/i })).toBeInTheDocument()
    expect(getByRole("status", { name: "Wizard progress" })).toHaveTextContent("3 / 4")

    fireEvent.click(getByRole("button", { name: /pair device/i }))
    expect(getByRole("heading", { name: /pair an android device/i })).toBeInTheDocument()
    expect(getByRole("status", { name: "Wizard progress" })).toHaveTextContent("4 / 4")
  })

  test("continue and back buttons move between steps", () => {
    const { getByRole } = render(<ConnectWizard />)

    fireEvent.click(getByRole("button", { name: /continue/i }))
    expect(getByRole("heading", { name: /configure external access/i })).toBeInTheDocument()

    fireEvent.click(getByRole("button", { name: /back/i }))
    expect(getByRole("heading", { name: /how will you connect/i })).toBeInTheDocument()
  })

  test("access mode cards toggle selection visually", () => {
    const { getByRole } = render(<ConnectWizard />)

    const localCard = getByRole("button", { name: /local or private network/i })
    const cloudCard = getByRole("button", { name: /cloud proxy/i })

    expect(localCard).toHaveAttribute("aria-pressed", "true")
    expect(cloudCard).toHaveAttribute("aria-pressed", "false")

    fireEvent.click(cloudCard)
    expect(localCard).toHaveAttribute("aria-pressed", "false")
    expect(cloudCard).toHaveAttribute("aria-pressed", "true")
  })

  test("proxy tabs switch static snippet content", () => {
    const { getByRole } = render(<ConnectWizard />)

    fireEvent.click(getByRole("button", { name: /external url/i }))

    const panel = getByRole("tabpanel")
    expect(within(panel).getByText(/reverse_proxy http:\/\/10\.8\.0\.2:3847/)).toBeInTheDocument()

    fireEvent.click(getByRole("tab", { name: /tailscale/i }))
    expect(within(panel).getByText(/tailscale serve --bg https \/ http:\/\/127\.0\.0\.1:3847/)).toBeInTheDocument()

    fireEvent.click(getByRole("tab", { name: /cloudflare tunnel/i }))
    expect(within(panel).getByText(/service: http:\/\/127\.0\.0\.1:3847/)).toBeInTheDocument()
  })

  test("external URL field is read-only reference text", () => {
    const { getByRole } = render(<ConnectWizard />)

    fireEvent.click(getByRole("button", { name: /external url/i }))

    const urlInput = getByRole("textbox", { name: /public server url/i })
    expect(urlInput).toHaveAttribute("readonly")
    expect(urlInput).toHaveValue("acp.gary.dev")
  })

  test("run connection test button is disabled", () => {
    const { getByRole } = render(<ConnectWizard />)

    fireEvent.click(getByRole("button", { name: /test connection/i }))

    const runTest = getByRole("button", { name: /run connection test/i })
    expect(runTest).toBeDisabled()
  })

  test("pair device actions are disabled with placeholder content", () => {
    const { getByRole, getByLabelText } = render(<ConnectWizard />)

    fireEvent.click(getByRole("button", { name: /pair device/i }))

    expect(getByLabelText("Decorative QR pairing code")).toBeInTheDocument()
    expect(getByRole("status", { name: /pairing code/i })).toHaveTextContent("—")
    expect(getByRole("button", { name: /regenerate/i })).toBeDisabled()
    expect(getByRole("button", { name: /view paired devices/i })).toBeDisabled()
  })
})
