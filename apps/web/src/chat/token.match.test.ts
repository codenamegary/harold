import { describe, expect, test } from "bun:test"
import {
  assertTokensMatchValue,
  Plugin,
  PluginRenderProps,
  scanTokens,
  Token,
} from "../design-system/prompt.input.model"
import {
  chatTokenKind,
  followedByWhitespace,
  looksComplete,
  matchCommand,
  matchMention,
} from "./token.match"

const paint = ({ chars }: PluginRenderProps) => chars

const textPlugin: Plugin = {
  kind: chatTokenKind.text,
  render: paint,
}

const commandPlugin: Plugin = {
  kind: chatTokenKind.command,
  match: matchCommand,
  render: paint,
}

const mentionPlugin: Plugin = {
  kind: chatTokenKind.mention,
  match: matchMention,
  render: paint,
}

const plugins: Plugin[] = [textPlugin, commandPlugin, mentionPlugin]

const text = (value: string, start: number): Token => ({
  kind: chatTokenKind.text,
  value,
  start,
  end: start + value.length,
})

const command = (value: string, start: number): Token => ({
  kind: chatTokenKind.command,
  value,
  start,
  end: start + value.length,
})

const mention = (value: string, start: number): Token => ({
  kind: chatTokenKind.mention,
  value,
  start,
  end: start + value.length,
})

const cases: Array<{ input: string; expected: Token[] }> = [
  { input: "", expected: [] },
  { input: "hello", expected: [text("hello", 0)] },
  { input: "hello world", expected: [text("hello world", 0)] },
  { input: "/cmd", expected: [command("/cmd", 0)] },
  { input: "/", expected: [command("/", 0)] },
  {
    input: "/cmd foo",
    expected: [command("/cmd", 0), text(" foo", 4)],
  },
  {
    input: "see /cmd now",
    expected: [text("see ", 0), command("/cmd", 4), text(" now", 8)],
  },
  { input: "src/foo", expected: [text("src/foo", 0)] },
  { input: "https://x.com/a", expected: [text("https://x.com/a", 0)] },
  {
    input: "/a /b",
    expected: [command("/a", 0), text(" ", 2), command("/b", 3)],
  },
  {
    input: "  /x",
    expected: [text("  ", 0), command("/x", 2)],
  },
  {
    input: "/cmd\nmore",
    expected: [command("/cmd", 0), text("\nmore", 4)],
  },
  { input: "@file", expected: [mention("@file", 0)] },
  { input: "user@host", expected: [text("user@host", 0)] },
  {
    input: "see /cmd and @file",
    expected: [
      text("see ", 0),
      command("/cmd", 4),
      text(" and ", 8),
      mention("@file", 13),
    ],
  },
]

describe("token matchers", () => {
  test.each(cases)("tokenizes $input", ({ input, expected }) => {
    const tokens = scanTokens(input, plugins)
    expect(tokens).toEqual(expected)
    assertTokensMatchValue(input, tokens)
  })
})

describe("followedByWhitespace", () => {
  test("is true when the next character is whitespace", () => {
    expect(followedByWhitespace(command("/cmd", 0), "/cmd foo")).toBe(true)
    expect(followedByWhitespace(command("/cmd", 0), "/cmd\nmore")).toBe(true)
  })

  test("is false at end of string", () => {
    expect(followedByWhitespace(command("/cmd", 0), "/cmd")).toBe(false)
  })
})

describe("looksComplete", () => {
  test("is true when followed by whitespace", () => {
    expect(looksComplete(command("/cmd", 0), "/cmd foo")).toBe(true)
  })

  test("is true when the token runs to the end of the string", () => {
    expect(looksComplete(command("/cmd", 0), "/cmd")).toBe(true)
    expect(looksComplete(mention("@notes-from-meeting", 4), "see @notes-from-meeting")).toBe(
      true,
    )
  })

  test("is false when a later non-space character follows", () => {
    expect(looksComplete(command("/cmd", 0), "/cmdx")).toBe(false)
  })
})
