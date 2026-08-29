import { describe, expect, test } from "bun:test"
import { fireEvent, render } from "@testing-library/react"
import { PromptInput } from "../../design-system/PromptInput"
import { chatPlugins } from "./ChatPlugins"

describe.skip("chatPlugins", () => {
  test("paints a complete command as a chip", () => {
    const { getByText } = render(
      <PromptInput
        aria-label="Prompt"
        value="hello /cmd "
        onChange={() => undefined}
        plugins={chatPlugins}
      />,
    )

    expect(getByText("/cmd").tagName.toLowerCase()).toBe("span")
    expect(getByText("/cmd")).toHaveClass("text-lime")
  })

  test("paints a trailing command with chip styling while the caret is on it", () => {
    const { getByRole } = render(
      <PromptInput
        aria-label="Prompt"
        value="hello /cmd"
        onChange={() => undefined}
        plugins={chatPlugins}
      />,
    )

    const field = getByRole("textbox", { name: "Prompt" })
    expect(field).toHaveTextContent("hello /cmd")
    expect(field.querySelector(".text-lime")).not.toBeNull()
    expect(field.querySelector("[data-token-start]")).toBeNull()
  })

  test("paints a trailing command as a chip when the caret is elsewhere", () => {
    const { getByRole, getByText } = render(
      <PromptInput
        aria-label="Prompt"
        value="hello /cmd"
        onChange={() => undefined}
        plugins={chatPlugins}
      />,
    )

    fireEvent.keyDown(getByRole("textbox", { name: "Prompt" }), { key: "Home" })
    expect(getByText("/cmd")).toHaveClass("text-lime")
  })

  test("paints a trailing long mention as an ellipsized chip when the caret is elsewhere", () => {
    const { getByRole, getByText } = render(
      <PromptInput
        aria-label="Prompt"
        value="see @notes-from-meeting"
        onChange={() => undefined}
        plugins={chatPlugins}
      />,
    )

    fireEvent.keyDown(getByRole("textbox", { name: "Prompt" }), { key: "Home" })
    expect(getByText("@notes-f…")).toHaveClass("text-violet")
  })

  test("paints a long mention as an ellipsized chip", () => {
    const { getByText } = render(
      <PromptInput
        aria-label="Prompt"
        value="see @notes-from-meeting "
        onChange={() => undefined}
        plugins={chatPlugins}
      />,
    )

    expect(getByText("@notes-f…")).toHaveClass("text-violet")
    expect(getByText("@notes-f…")).toHaveAttribute(
      "title",
      "@notes-from-meeting",
    )
  })

  test("expands a long mention when the caret is at its end", () => {
    const { getByRole, queryByText } = render(
      <PromptInput
        aria-label="Prompt"
        value="see @notes-from-meeting "
        onChange={() => undefined}
        plugins={chatPlugins}
      />,
    )

    fireEvent.keyDown(getByRole("textbox", { name: "Prompt" }), {
      key: "ArrowLeft",
    })
    const field = getByRole("textbox", { name: "Prompt" })
    expect(queryByText("@notes-f…")).toBeNull()
    expect(field).toHaveTextContent("see @notes-from-meeting")
    expect(field.querySelector(".text-violet")).not.toBeNull()
  })

  test("expands a command chip when it is clicked", () => {
    const { getByText, getByRole } = render(
      <PromptInput
        aria-label="Prompt"
        value="hello /cmd "
        onChange={() => undefined}
        plugins={chatPlugins}
      />,
    )

    fireEvent.mouseDown(getByText("/cmd"))
    const field = getByRole("textbox", { name: "Prompt" })
    expect(field.querySelector(".text-lime")).not.toBeNull()
    expect(field.querySelector("[data-token-start]")).toBeNull()
  })
})
