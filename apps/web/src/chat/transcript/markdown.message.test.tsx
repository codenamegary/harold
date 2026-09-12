import { afterEach, describe, expect, test } from "bun:test"
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { ChatTranscript } from "./ChatTranscript"
import { MarkdownMessage } from "./MarkdownMessage"

afterEach(() => {
  cleanup()
})

describe("MarkdownMessage", () => {
  test("renders bold and fenced code as HTML elements", async () => {
    const markdown = "Use **JWT** for auth.\n\n```ts\nconst x = 1\n```"
    const { container, getByText } = render(<MarkdownMessage text={markdown} />)

    const bold = getByText("JWT")
    expect(bold.getAttribute("data-streamdown")).toBe("strong")
    await waitFor(() => {
      expect(container.textContent).toContain("const x = 1")
    })
    expect(
      container.querySelector(
        "[data-streamdown='code-block'], [data-streamdown='inline-code'], code, pre",
      ),
    ).not.toBeNull()
    await act(async () => {
      await Promise.resolve()
    })
  })

  test("renders plain prose without markdown markers", () => {
    const { getByText } = render(<MarkdownMessage text="Auth uses JWT" />)

    expect(getByText("Auth uses JWT")).toBeInTheDocument()
  })

  test("opens links in a new tab without an external-link confirmation", () => {
    const { getByRole, queryByText } = render(
      <MarkdownMessage
        text="[Repo](https://github.com/codenamegary/agent-server)"
      />,
    )

    const link = getByRole("link", { name: "Repo" })
    expect(link.getAttribute("target")).toBe("_blank")

    act(() => {
      fireEvent.click(link)
    })

    expect(queryByText("Open external link?")).not.toBeInTheDocument()
    expect(
      queryByText("You're about to visit an external website."),
    ).not.toBeInTheDocument()
  })
})

describe("ChatTranscript markdown", () => {
  test("assistant rows render markdown; user rows stay plain text", () => {
    const { getByText, getByRole } = render(
      <ChatTranscript
        rows={[
          { kind: "user", turnId: "turn_1", text: "Explain **auth**" },
          {
            kind: "assistant",
            turnId: "turn_1",
            text: "Auth uses **JWT** tokens.",
          },
        ]}
      />,
    )

    const transcript = getByRole("region", { name: "Chat transcript" })
    expect(transcript).toHaveTextContent("Explain **auth**")
    expect(getByText("JWT").getAttribute("data-streamdown")).toBe("strong")
  })
})
