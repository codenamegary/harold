import { describe, expect, it } from "bun:test"
import { execFileSync } from "node:child_process"
import {
  escapeInputChunk,
  FOCUS_SETTLE_MS,
  inputTextTokens,
  remainingGapMs,
  typeIntoField,
} from "./input.text"
import type { TypeIntoFieldDeps } from "./input.text"

const NASTY = `Mia's cat (plan): don't build? $HOME ~/x *y* & z|w #4 "q" [b] {c} 100%`

const shellRoundtrip = (token: string): string =>
  execFileSync("/bin/sh", ["-c", `printf '%s' ${token}`], { encoding: "utf8" })

describe("input text escaping", () => {
  const cases = [
    "Plan only; do not edit files.",
    NASTY,
    "UPPER lower 0123 a-b_c/d.e@f:g+h=i,j",
    "127.0.0.1",
  ]

  it("round-trips one token per character through the shell", () => {
    for (const text of cases) {
      const tokens = inputTextTokens(text)
      expect(tokens).toHaveLength([...text].length)
      for (const [index, character] of [...text].entries()) {
        const token = tokens[index]
        const expected = character === " " ? "%s" : character
        if (token === undefined) {
          throw new Error(`missing token for ${JSON.stringify(character)}`)
        }
        expect(shellRoundtrip(token)).toBe(expected)
      }
    }
  })

  it("quotes the shell metacharacters and an empty string", () => {
    for (const character of [" ", "'", '"', "$", "`", "*", "?", ";", "&", "|", "(", ")", "\\", "%"]) {
      const token = inputTextTokens(character)[0] ?? ""
      expect(token.length).toBeGreaterThanOrEqual(3)
      expect(token.startsWith("'")).toBe(true)
      expect(token.endsWith("'")).toBe(true)
    }
    expect(inputTextTokens("")).toEqual([])
    expect(escapeInputChunk("")).toBe("''")
  })
})

describe("remaining gap", () => {
  it("counts the keystroke toward the gap", () => {
    expect(remainingGapMs(0, 160)).toBe(160)
    expect(remainingGapMs(30, 160)).toBe(130)
    expect(remainingGapMs(160, 160)).toBe(0)
    expect(remainingGapMs(400, 160)).toBe(0)
  })
})

describe("typeIntoField", () => {
  const harness = (fact?: () => string) => {
    const sent: string[] = []
    const slept: number[] = []
    const stamps: string[] = []
    const focused: string[] = []
    const deps: TypeIntoFieldDeps = {
      readFact: async () => (fact === undefined ? sent.join("") : fact()),
      focus: async (tag) => {
        focused.push(tag)
      },
      sendCharacter: async (character) => {
        sent.push(character)
      },
      clearField: async () => {},
      stampKey: () => {
        stamps.push("key")
      },
      stampKeysDone: () => {
        stamps.push("keys_done")
      },
      sleep: async (ms) => {
        slept.push(ms)
      },
      gapMs: 80,
      now: () => 0,
      replace: false,
    }
    return { sent, slept, stamps, focused, deps }
  }

  it("focuses once, settles, then stamps each raw character", async () => {
    const run = harness()
    const value = await typeIntoField("host", "a b", run.deps)
    expect(value).toBe("a b")
    expect(run.focused).toEqual(["ssh_host_field"])
    expect(run.sent).toEqual(["a", " ", "b"])
    expect(run.stamps).toEqual(["key", "key", "key", "keys_done"])
    expect(run.slept[0]).toBe(FOCUS_SETTLE_MS)
    expect(run.slept.slice(1)).toEqual([80, 80, 80])
  })

  it("fails with FieldNotEmpty and sends nothing when the fact is set", async () => {
    const run = harness(() => "22")
    const failure = await typeIntoField("port", "2223", run.deps).then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).name).toBe("FieldNotEmpty")
    expect(run.sent).toEqual([])
    expect(run.stamps).toEqual([])
    expect(run.focused).toEqual(["ssh_port_field"])
  })

  it("backspaces a suggestion and types over it", async () => {
    let value = "127"
    const cleared: string[] = []
    const sent: string[] = []
    const landed = await typeIntoField("name", "Demo host", {
      readFact: async () => value,
      focus: async () => {},
      sendCharacter: async (character) => {
        sent.push(character)
        value += character
      },
      clearField: async (current) => {
        cleared.push(current)
        value = ""
      },
      stampKey: () => {},
      stampKeysDone: () => {},
      sleep: async () => {},
      gapMs: 80,
      replace: true,
    })
    expect(cleared).toEqual(["127"])
    expect(sent.join("")).toBe("Demo host")
    expect(landed).toBe("Demo host")
  })

  it("fails when the fact does not match the typed text", async () => {
    const run = harness(() => "")
    const failure = await typeIntoField("name", "Demo", run.deps).then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toMatch(/name holds "" after typing "Demo"/)
    expect(run.stamps.at(-1)).toBe("keys_done")
  })
})
