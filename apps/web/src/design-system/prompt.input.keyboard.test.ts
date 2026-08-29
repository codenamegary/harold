import { describe, expect, test } from "bun:test"
import {
  dispatchKeyboard,
  isAppleNavigator,
  isLineMod,
  isWordMod,
  KeyEvent,
  on,
  promptKeyHandlers,
} from "./prompt.input.keyboard"
import { editorAt } from "./prompt.input.model"

const chord = (partial: Partial<KeyEvent> & { key: string }): KeyEvent => ({
  mod: false,
  shift: false,
  alt: false,
  apple: false,
  ...partial,
})

describe("keyboard dispatch", () => {
  test("runs the first matching handler", () => {
    const next = dispatchKeyboard(
      [
        { match: on("ArrowLeft"), run: (state) => editorAt(state.value, 0) },
        { match: on("*", { shift: "any" }), run: (state, event) => editorAt(event.key, 1) },
      ],
      editorAt("ab", 2),
      chord({ key: "ArrowLeft" }),
    )
    expect(next).toEqual(editorAt("ab", 0))
  })

  test("returns null when no handler matches so modifiers can pass through", () => {
    const next = dispatchKeyboard(
      promptKeyHandlers,
      editorAt("hi", 2),
      chord({ key: "Enter", mod: true, apple: true }),
    )
    expect(next).toBeNull()
  })

  test("inserts a printable character", () => {
    const next = dispatchKeyboard(
      promptKeyHandlers,
      editorAt("h", 1),
      chord({ key: "i" }),
    )
    expect(next?.value).toBe("hi")
    expect(next?.focus).toBe(2)
  })

  test("shift+arrow extends the selection", () => {
    const next = dispatchKeyboard(
      promptKeyHandlers,
      editorAt("hello", 5),
      chord({ key: "ArrowLeft", shift: true }),
    )
    expect(next?.value).toBe("hello")
    expect(next?.anchor).toBe(5)
    expect(next?.focus).toBe(4)
  })

  test("mod+a selects all", () => {
    const next = dispatchKeyboard(
      promptKeyHandlers,
      editorAt("hello", 2),
      chord({ key: "a", mod: true }),
    )
    expect(next?.anchor).toBe(0)
    expect(next?.focus).toBe(5)
  })

  test("backspace deletes a selection", () => {
    const next = dispatchKeyboard(
      promptKeyHandlers,
      { value: "hello", anchor: 1, focus: 4 },
      chord({ key: "Backspace" }),
    )
    expect(next?.value).toBe("ho")
    expect(next?.focus).toBe(1)
  })

  test("ctrl+arrow moves by word on non-apple", () => {
    const next = dispatchKeyboard(
      promptKeyHandlers,
      editorAt("hello world", 11),
      chord({ key: "ArrowLeft", mod: true, apple: false }),
    )
    expect(next?.focus).toBe(6)
  })

  test("cmd+arrow moves to the line edge on apple", () => {
    const next = dispatchKeyboard(
      promptKeyHandlers,
      editorAt("hello world", 6),
      chord({ key: "ArrowLeft", mod: true, apple: true }),
    )
    expect(next?.focus).toBe(0)
  })

  test("alt+arrow does not steal browser back on non-apple", () => {
    const next = dispatchKeyboard(
      promptKeyHandlers,
      editorAt("hello", 5),
      chord({ key: "ArrowLeft", alt: true, apple: false }),
    )
    expect(next).toBeNull()
  })
})

describe("modifier helpers", () => {
  test("detects apple platforms", () => {
    expect(isAppleNavigator("MacIntel", "")).toBe(true)
    expect(isAppleNavigator("Win32", "")).toBe(false)
  })

  test("word and line mods differ by platform", () => {
    expect(isWordMod(chord({ key: "ArrowLeft", alt: true, apple: true }))).toBe(true)
    expect(isLineMod(chord({ key: "ArrowLeft", mod: true, apple: true }))).toBe(true)
    expect(isWordMod(chord({ key: "ArrowLeft", mod: true, apple: false }))).toBe(true)
    expect(isLineMod(chord({ key: "ArrowLeft", mod: true, apple: false }))).toBe(false)
  })
})
