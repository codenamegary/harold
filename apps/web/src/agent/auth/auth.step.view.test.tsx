import { describe, expect, mock, test } from "bun:test"
import { fireEvent } from "@testing-library/react"
import { AuthStep } from "contracts/http/agent-auth"
import { renderWithProviders } from "../../query/render.with.providers"
import { AuthStepView } from "./AuthStepView"

describe("AuthStepView", () => {
  test("renders show_message body", () => {
    const step: AuthStep = {
      type: "show_message",
      level: "info",
      body: "Run claude login on the host.",
    }
    const { getByText } = renderWithProviders(
      <AuthStepView
        step={step}
        confirmDisabled={false}
        confirming={false}
        onConfirm={() => undefined}
      />,
    )
    expect(getByText("Run claude login on the host.")).toBeTruthy()
  })

  test("confirm step calls onConfirm with stepId", () => {
    const onConfirm = mock((_stepId: string) => undefined)
    const step: AuthStep = {
      type: "confirm",
      stepId: "host-login",
      title: "Sign in",
      body: "Finished on the host?",
      confirmLabel: "I have logged in",
    }
    const { getByRole } = renderWithProviders(
      <AuthStepView
        step={step}
        confirmDisabled={false}
        confirming={false}
        onConfirm={onConfirm}
      />,
    )
    fireEvent.click(getByRole("button", { name: "I have logged in" }))
    expect(onConfirm).toHaveBeenCalledWith("host-login")
  })

  test("renders working and done steps", () => {
    const working: AuthStep = { type: "working", label: "Reconnecting…" }
    const done: AuthStep = {
      type: "done",
      outcome: "succeeded",
      message: null,
    }
    const workingView = renderWithProviders(
      <AuthStepView
        step={working}
        confirmDisabled={false}
        confirming={false}
        onConfirm={() => undefined}
      />,
    )
    expect(workingView.getByText("Reconnecting…")).toBeTruthy()

    const doneView = renderWithProviders(
      <AuthStepView
        step={done}
        confirmDisabled={false}
        confirming={false}
        onConfirm={() => undefined}
      />,
    )
    expect(doneView.getByText("Signed in")).toBeTruthy()
  })
})
