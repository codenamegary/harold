import { describe, expect, test } from "bun:test"
import { fireEvent, render } from "@testing-library/react"
import { ChatComposer } from "./ChatComposer"

describe("ChatComposer", () => {
  test("clicking the composer chrome focuses the prompt", () => {
    const { getByRole, getByText } = render(
      <ChatComposer
        disabled={false}
        running={false}
        blockedMessage={null}
        onSend={() => undefined}
        onCancel={() => undefined}
      />,
    )

    fireEvent.mouseDown(getByText("to send"))
    expect(getByRole("textbox", { name: "Chat message" })).toHaveFocus()
  })

  test("clicking send does not steal a disabled prompt into focus", () => {
    const { getByRole } = render(
      <ChatComposer
        disabled={true}
        running={false}
        blockedMessage={null}
        onSend={() => undefined}
        onCancel={() => undefined}
      />,
    )

    fireEvent.mouseDown(getByRole("button", { name: "Send message" }))
    expect(getByRole("textbox", { name: "Chat message" })).not.toHaveFocus()
  })
})
