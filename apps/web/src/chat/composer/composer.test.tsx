import { describe, expect, test } from "bun:test"
import { fireEvent, render } from "@testing-library/react"
import { ConfigOption, ConfigOptionValue } from "contracts/http/config.options"
import { ChatComposer, ChatComposerConfig } from "./ChatComposer"

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

    fireEvent.mouseDown(getByText("⌘"))
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

const composerConfigOption = (
  overrides: Partial<Extract<ConfigOption, { type: "select" }>>,
): ConfigOption => ({
  id: "x",
  name: "X",
  category: "model",
  type: "select",
  currentValue: "m1",
  options: [{ value: "m1", name: "M1" }],
  ...overrides,
})

const composerModel = composerConfigOption({
  id: "model",
  name: "Model",
  category: "model",
  currentValue: "openai/gpt-5.2",
  options: [
    { value: "opencode/big-pickle", name: "Big Pickle" },
    { value: "openai/gpt-5.2", name: "GPT-5.2" },
  ],
})

const composerMode = composerConfigOption({
  id: "mode",
  name: "Mode",
  category: "mode",
  currentValue: "agent",
  options: [
    { value: "agent", name: "Agent" },
    { value: "ask", name: "Ask" },
  ],
})

const composerThinking = composerConfigOption({
  id: "thought_level",
  name: "Thinking",
  category: "thought_level",
  currentValue: "medium",
  options: [
    { value: "off", name: "Off" },
    { value: "medium", name: "Medium" },
  ],
})

describe("ChatComposer session config", () => {
  const renderWithConfig = (props: { config?: ChatComposerConfig }) =>
    render(
      <ChatComposer
        disabled={false}
        running={false}
        blockedMessage={null}
        supportsImages={false}
        supportsFiles={false}
        attachments={[]}
        onFilesPicked={() => undefined}
        onRemoveAttachment={() => undefined}
        onRetryAttachment={() => undefined}
        onSend={() => undefined}
        onCancel={() => undefined}
        config={props.config}
      />,
    )

  test("renders model, mode and effort controls in the toolbar", () => {
    const { getByRole } = renderWithConfig({
      config: {
        model: composerModel,
        mode: composerMode,
        thinking: composerThinking,
        onModelPick: () => undefined,
        onModeCycle: () => undefined,
        onThinkingCycle: () => undefined,
      },
    })

    expect(getByRole("button", { name: /Model: GPT-5\.2/ })).toBeTruthy()
    expect(getByRole("button", { name: /Mode: Agent/ })).toBeTruthy()
    expect(getByRole("button", { name: /Thinking: Medium, level 2 of 2/ })).toBeTruthy()
  })

  test("renders no config controls without a config prop", () => {
    const { queryByRole } = renderWithConfig({})

    expect(queryByRole("button", { name: /Model:/ })).toBeNull()
    expect(queryByRole("button", { name: /Mode:/ })).toBeNull()
    expect(queryByRole("button", { name: /Thinking:/ })).toBeNull()
  })

  test("pressing mode cycles through the composer callback", () => {
    const seen: ConfigOptionValue[] = []
    const { getByRole } = renderWithConfig({
      config: {
        model: composerModel,
        mode: composerMode,
        onModelPick: () => undefined,
        onModeCycle: (next) => {
          seen.push(next)
        },
        onThinkingCycle: () => undefined,
      },
    })

    fireEvent.click(getByRole("button", { name: /Mode: Agent/ }))

    expect(seen).toEqual([composerMode.options[1]])
  })

  test("pressing thinking cycles through the composer callback", () => {
    const seen: ConfigOptionValue[] = []
    const { getByRole } = renderWithConfig({
      config: {
        thinking: composerThinking,
        onModelPick: () => undefined,
        onModeCycle: () => undefined,
        onThinkingCycle: (next) => {
          seen.push(next)
        },
      },
    })

    fireEvent.click(getByRole("button", { name: /Thinking: Medium/ }))

    expect(seen).toEqual([composerThinking.options[0]])
  })

  test("the model link opens the popover and picking fires onModelPick", () => {
    const picked: string[] = []
    const { getByRole } = renderWithConfig({
      config: {
        model: composerModel,
        onModelPick: (value) => {
          picked.push(value)
        },
        onModeCycle: () => undefined,
        onThinkingCycle: () => undefined,
      },
    })

    fireEvent.click(getByRole("button", { name: /Model: GPT-5\.2/ }))
    fireEvent.click(getByRole("option", { name: /Big Pickle/ }))

    expect(picked).toEqual(["opencode/big-pickle"])
  })

  test("the selected mode paints the composer's left border in the mode color", () => {
    const { container } = renderWithConfig({
      config: {
        mode: composerMode,
        onModelPick: () => undefined,
        onModeCycle: () => undefined,
        onThinkingCycle: () => undefined,
      },
    })

    const box = container.firstElementChild?.firstElementChild as HTMLElement
    expect(box.className).toContain("border-l-4")
    expect(box.className).toContain("border-l-lime")
  })

  test("an unknown mode leaves the default border", () => {
    const unknownMode = composerConfigOption({
      id: "mode",
      name: "Mode",
      category: "mode",
      currentValue: "mystery",
      options: [{ value: "mystery", name: "Mystery" }],
    })
    const { container } = renderWithConfig({
      config: {
        mode: unknownMode,
        onModelPick: () => undefined,
        onModeCycle: () => undefined,
        onThinkingCycle: () => undefined,
      },
    })

    const box = container.firstElementChild?.firstElementChild as HTMLElement
    expect(box.className).not.toContain("border-l-lime")
  })

  test("the shortcut hint sits on the right without the 'to send' copy", () => {
    const { getByText, queryByText, container } = renderWithConfig({
      config: {
        mode: composerMode,
        onModelPick: () => undefined,
        onModeCycle: () => undefined,
        onThinkingCycle: () => undefined,
      },
    })

    expect(queryByText("to send")).toBeNull()
    const hint = getByText("⌘", { exact: false }).closest("span")
    expect(hint).toBeTruthy()
    // hint is inside the right cluster: it follows the send button's container order
    const toolbar = container.querySelector(".pointer-events-none.absolute.inset-x-0.bottom-0")
    expect(toolbar?.lastElementChild?.textContent).toContain("⌘")
  })

  test("a config set error replaces the status strip copy", () => {
    const { getByText, queryByText } = renderWithConfig({
      config: {
        mode: composerMode,
        error: "Config option rejected",
        onModelPick: () => undefined,
        onModeCycle: () => undefined,
        onThinkingCycle: () => undefined,
      },
    })

    expect(getByText("Config option rejected")).toBeTruthy()
    expect(queryByText("Prompts run locally on this machine")).toBeNull()
  })
})
