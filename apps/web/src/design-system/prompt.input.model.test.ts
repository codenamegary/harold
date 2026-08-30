import { describe, expect, test } from "bun:test"
import {
  assertTokensMatchValue,
  caretIsInside,
  deleteBackward,
  deleteForward,
  editorAt,
  insertText,
  Matcher,
  Plugin,
  PluginRenderProps,
  rangeTouches,
  replaceToken,
  scanTokens,
  Token,
  tokenAtCaret,
  wordLeft,
  wordRight,
} from "./prompt.input.model"

const paint = ({ chars }: PluginRenderProps) => chars

const textPlugin: Plugin = {
  kind: "text",
  render: paint,
}

const matchTrigger = (trigger: string, kind: string): Matcher => {
  return (text, offset) => {
    if (text[offset] !== trigger) {
      return null
    }
    if (offset !== 0 && !/\s/.test(text[offset - 1] ?? "")) {
      return null
    }
    const matched = text.slice(offset).match(new RegExp(`^\\${trigger}\\S*`))
    const value = matched?.[0] ?? trigger
    return {
      kind,
      value,
      start: offset,
      end: offset + value.length,
    }
  }
}

const commandPlugin: Plugin = {
  kind: "command",
  match: matchTrigger("/", "command"),
  render: paint,
}

const mentionPlugin: Plugin = {
  kind: "mention",
  match: matchTrigger("@", "mention"),
  render: paint,
}

const token = (
  kind: string,
  value: string,
  start: number,
): Token => ({
  kind,
  value,
  start,
  end: start + value.length,
})

describe("scanTokens", () => {
  test("emits no tokens for an empty string", () => {
    expect(scanTokens("", [textPlugin, commandPlugin])).toEqual([])
  })

  test("emits one text token when no matcher hits", () => {
    const tokens = scanTokens("hello world", [textPlugin, commandPlugin])
    expect(tokens).toEqual([token("text", "hello world", 0)])
    assertTokensMatchValue("hello world", tokens)
  })

  test("emits a matched token then the remaining text", () => {
    const tokens = scanTokens("/cmd foo", [textPlugin, commandPlugin])
    expect(tokens).toEqual([
      token("command", "/cmd", 0),
      token("text", " foo", 4),
    ])
    assertTokensMatchValue("/cmd foo", tokens)
  })

  test("keeps a mid-word trigger as text", () => {
    expect(scanTokens("src/foo", [textPlugin, commandPlugin])).toEqual([
      token("text", "src/foo", 0),
    ])
  })

  test("runs every matcher in one scan", () => {
    const input = "see /cmd and @file"
    const tokens = scanTokens(input, [
      textPlugin,
      commandPlugin,
      mentionPlugin,
    ])
    expect(tokens).toEqual([
      token("text", "see ", 0),
      token("command", "/cmd", 4),
      token("text", " and ", 8),
      token("mention", "@file", 13),
    ])
    assertTokensMatchValue(input, tokens)
  })

  test("uses the first matching plugin when two matchers hit", () => {
    const takeOne: Plugin = {
      kind: "short",
      match: (text, offset) =>
        text[offset] === "/"
          ? {
              kind: "short",
              value: "/",
              start: offset,
              end: offset + 1,
            }
          : null,
      render: paint,
    }
    const takeAll: Plugin = {
      kind: "long",
      match: (text, offset) =>
        text[offset] === "/"
          ? {
              kind: "long",
              value: text.slice(offset),
              start: offset,
              end: text.length,
            }
          : null,
      render: paint,
    }

    expect(scanTokens("/xy", [textPlugin, takeOne, takeAll])).toEqual([
      token("short", "/", 0),
      token("text", "xy", 1),
    ])
    expect(scanTokens("/xy", [textPlugin, takeAll, takeOne])).toEqual([
      token("long", "/xy", 0),
    ])
  })

  test("requires exactly one plugin without match", () => {
    expect(() => scanTokens("hi", [commandPlugin])).toThrow(
      /without match/,
    )
    expect(() => scanTokens("hi", [textPlugin, textPlugin])).toThrow(
      /without match/,
    )
  })
})

const command: Token = { kind: "command", value: "/cmd", start: 6, end: 10 }
const after: Token = { kind: "text", value: " ", start: 10, end: 11 }
const tokens: Token[] = [
  { kind: "text", value: "hello ", start: 0, end: 6 },
  command,
  after,
]
const raw = "hello /cmd "

describe("prompt.input.model", () => {
  test("assertTokensMatchValue accepts a full cover", () => {
    expect(() => assertTokensMatchValue(raw, tokens)).not.toThrow()
  })

  test("assertTokensMatchValue rejects a gap", () => {
    expect(() =>
      assertTokensMatchValue(raw, [tokens[0], tokens[2]]),
    ).toThrow(/concatenate/)
  })

  test("caret at a token end is inside", () => {
    expect(caretIsInside(command, 10)).toBe(true)
    expect(caretIsInside(command, 6)).toBe(true)
    expect(caretIsInside(command, 5)).toBe(false)
    expect(caretIsInside(command, 11)).toBe(false)
  })

  test("insertText splices at the caret", () => {
    const next = insertText(editorAt("ab", 1), "X")
    expect(next.value).toBe("aXb")
    expect(next.focus).toBe(2)
    expect(next.anchor).toBe(2)
  })

  test("insertText replaces a selection", () => {
    const next = insertText({ value: "abcd", anchor: 1, focus: 3 }, "X")
    expect(next.value).toBe("aXd")
    expect(next.focus).toBe(2)
  })

  test("deleteBackward removes one character", () => {
    const next = deleteBackward(editorAt(raw, 10))
    expect(next.value).toBe("hello /cm ")
    expect(next.focus).toBe(9)
  })

  test("deleteBackward removes a selection", () => {
    const next = deleteBackward({ value: "abcd", anchor: 1, focus: 3 })
    expect(next.value).toBe("ad")
    expect(next.focus).toBe(1)
  })

  test("deleteForward removes the next character", () => {
    const next = deleteForward(editorAt("abc", 1))
    expect(next.value).toBe("ac")
    expect(next.focus).toBe(1)
  })

  test("rangeTouches expands chips under a selection", () => {
    expect(rangeTouches(command, { anchor: 0, focus: 0 })).toBe(false)
    expect(rangeTouches(command, { anchor: 6, focus: 6 })).toBe(true)
    expect(rangeTouches(command, { anchor: 10, focus: 10 })).toBe(true)
    expect(rangeTouches(command, { anchor: 0, focus: 8 })).toBe(true)
    expect(rangeTouches(command, { anchor: 10, focus: 11 })).toBe(false)
  })

  test("wordLeft and wordRight jump over words", () => {
    expect(wordLeft("hello world", 11)).toBe(6)
    expect(wordLeft("hello world", 6)).toBe(0)
    expect(wordRight("hello world", 0)).toBe(5)
    expect(wordRight("hello world", 5)).toBe(11)
  })
})

describe("tokenAtCaret", () => {
  const tokens = scanTokens("look at /pl", [textPlugin, commandPlugin])

  test("finds the token holding the caret", () => {
    expect(tokenAtCaret(tokens, 10)?.value).toBe("/pl")
  })

  test("gives the boundary to the token that ends there", () => {
    expect(tokenAtCaret(tokens, 11)?.value).toBe("/pl")
  })

  test("gives the start boundary to the token before it", () => {
    expect(tokenAtCaret(tokens, 8)?.kind).toBe("text")
  })

  test("returns null past the end", () => {
    expect(tokenAtCaret(tokens, 99)).toBeNull()
  })
})

describe("replaceToken", () => {
  const commandAt8 = token("command", "/pl", 8)

  test("swaps the token and adds a trailing space", () => {
    const next = replaceToken(editorAt("look at /pl", 11), commandAt8, "/plan")
    expect(next.value).toBe("look at /plan ")
    expect(next.focus).toBe(14)
  })

  test("reuses a space that already follows", () => {
    const next = replaceToken(
      editorAt("look at /pl more", 11),
      commandAt8,
      "/plan",
    )
    expect(next.value).toBe("look at /plan more")
    expect(next.focus).toBe(14)
  })

  test("collapses the selection after the replacement", () => {
    const next = replaceToken(
      { value: "look at /pl", anchor: 0, focus: 11 },
      commandAt8,
      "/plan",
    )
    expect(next.anchor).toBe(next.focus)
  })
})
