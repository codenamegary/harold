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
        supportsImages
        supportsFiles
        attachments={[]}
        onFilesPicked={() => undefined}
        onRemoveAttachment={() => undefined}
        onRetryAttachment={() => undefined}
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
        supportsImages
        supportsFiles
        attachments={[]}
        onFilesPicked={() => undefined}
        onRemoveAttachment={() => undefined}
        onRetryAttachment={() => undefined}
        onSend={() => undefined}
        onCancel={() => undefined}
      />,
    )

    fireEvent.mouseDown(getByRole("button", { name: "Send message" }))
    expect(getByRole("textbox", { name: "Chat message" })).not.toHaveFocus()
  })
})

describe("ChatComposer attachment buttons", () => {
  const renderComposer = (props: {
    supportsImages?: boolean
    supportsFiles?: boolean
  }) =>
    render(
      <ChatComposer
        disabled={false}
        running={false}
        blockedMessage={null}
        supportsImages={props.supportsImages ?? false}
        supportsFiles={props.supportsFiles ?? false}
        attachments={[]}
        onFilesPicked={() => undefined}
        onRemoveAttachment={() => undefined}
        onRetryAttachment={() => undefined}
        onSend={() => undefined}
        onCancel={() => undefined}
      />,
    )

  test("hides both buttons when the agent advertises neither capability", () => {
    const { queryByRole } = renderComposer({})
    expect(queryByRole("button", { name: "Attach photo" })).toBeNull()
    expect(queryByRole("button", { name: "Attach files" })).toBeNull()
  })

  test("shows the photo button when promptCapabilities.image is advertised", () => {
    const { getByRole, queryByRole } = renderComposer({ supportsImages: true })
    expect(getByRole("button", { name: "Attach photo" })).toBeTruthy()
    expect(queryByRole("button", { name: "Attach files" })).toBeNull()
  })

  test("shows the files button when promptCapabilities.embeddedContext is advertised", () => {
    const { getByRole, queryByRole } = renderComposer({ supportsFiles: true })
    expect(getByRole("button", { name: "Attach files" })).toBeTruthy()
    expect(queryByRole("button", { name: "Attach photo" })).toBeNull()
  })

  test("shows both buttons when both capabilities are advertised", () => {
    const { getByRole } = renderComposer({
      supportsImages: true,
      supportsFiles: true,
    })
    expect(getByRole("button", { name: "Attach photo" })).toBeTruthy()
    expect(getByRole("button", { name: "Attach files" })).toBeTruthy()
  })

  test("file picker feeds onFilesPicked", () => {
    const picked: string[] = []
    render(
      <ChatComposer
        disabled={false}
        running={false}
        blockedMessage={null}
        supportsImages={false}
        supportsFiles
        attachments={[]}
        onFilesPicked={(files) => picked.push(...Array.from(files).map((f) => f.name))}
        onRemoveAttachment={() => undefined}
        onRetryAttachment={() => undefined}
        onSend={() => undefined}
        onCancel={() => undefined}
      />,
    )

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(["x"], "notes.md", { type: "text/markdown" })
    Object.defineProperty(input, "files", { value: [file] })
    fireEvent.change(input)
    expect(picked).toEqual(["notes.md"])
  })
})
