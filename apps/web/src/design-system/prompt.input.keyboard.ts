import {
  deleteBackward,
  deleteForward,
  deleteToLineStart,
  deleteWordBackward,
  deleteWordForward,
  EditorState,
  insertText,
  moveByChar,
  moveByWord,
  moveToDocumentEnd,
  moveToDocumentStart,
  moveToLineEnd,
  moveToLineStart,
  moveVertically,
  selectAll,
} from "./prompt.input.model"

export type KeyEvent = {
  key: string
  mod: boolean
  shift: boolean
  alt: boolean
  apple: boolean
}

export type KeyboardHandler = {
  match: (event: KeyEvent) => boolean
  run: (state: EditorState, event: KeyEvent) => EditorState
}

export const readKeyEvent = (
  event: {
    key: string
    metaKey: boolean
    ctrlKey: boolean
    shiftKey: boolean
    altKey: boolean
  },
  apple: boolean,
): KeyEvent => ({
  key: event.key,
  mod: event.metaKey || event.ctrlKey,
  shift: event.shiftKey,
  alt: event.altKey,
  apple,
})

export const isAppleNavigator = (platform: string, userAgent: string): boolean =>
  /Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X/i.test(userAgent)

export const isWordMod = (event: KeyEvent): boolean =>
  event.apple ? event.alt : event.mod

export const isLineMod = (event: KeyEvent): boolean => event.apple && event.mod

type KeyMods = {
  mod?: boolean
  shift?: boolean | "any"
  alt?: boolean
}

const keyMatches = (
  pattern: string | ReadonlyArray<string>,
  event: KeyEvent,
): boolean => {
  const keys = typeof pattern === "string" ? [pattern] : pattern
  if (keys.includes("*")) {
    return event.key.length === 1
  }
  return keys.includes(event.key)
}

export const on = (
  key: string | ReadonlyArray<string>,
  mods: KeyMods = {},
): ((event: KeyEvent) => boolean) => {
  return (event) => {
    if (!keyMatches(key, event)) {
      return false
    }
    if ((mods.mod ?? false) !== event.mod) {
      return false
    }
    if ((mods.alt ?? false) !== event.alt) {
      return false
    }
    if (mods.shift !== "any" && (mods.shift ?? false) !== event.shift) {
      return false
    }
    return true
  }
}

export const dispatchKeyboard = (
  handlers: ReadonlyArray<KeyboardHandler>,
  state: EditorState,
  event: KeyEvent,
): EditorState | null => {
  const handler = handlers.find((candidate) => candidate.match(event))
  if (handler === undefined) {
    return null
  }
  return handler.run(state, event)
}

export const promptKeyHandlers: ReadonlyArray<KeyboardHandler> = [
  {
    match: (event) => event.key === "ArrowLeft" && isLineMod(event),
    run: (state, event) => moveToLineStart(state, event.shift),
  },
  {
    match: (event) => event.key === "ArrowRight" && isLineMod(event),
    run: (state, event) => moveToLineEnd(state, event.shift),
  },
  {
    match: (event) => event.key === "ArrowLeft" && isWordMod(event),
    run: (state, event) => moveByWord(state, -1, event.shift),
  },
  {
    match: (event) => event.key === "ArrowRight" && isWordMod(event),
    run: (state, event) => moveByWord(state, 1, event.shift),
  },
  {
    match: on("ArrowLeft", { shift: "any" }),
    run: (state, event) => moveByChar(state, -1, event.shift),
  },
  {
    match: on("ArrowRight", { shift: "any" }),
    run: (state, event) => moveByChar(state, 1, event.shift),
  },
  {
    match: on("ArrowUp", { shift: "any" }),
    run: (state, event) => moveVertically(state, -1, event.shift),
  },
  {
    match: on("ArrowDown", { shift: "any" }),
    run: (state, event) => moveVertically(state, 1, event.shift),
  },
  {
    match: on("Home", { mod: true, shift: "any" }),
    run: (state, event) => moveToDocumentStart(state, event.shift),
  },
  {
    match: on("End", { mod: true, shift: "any" }),
    run: (state, event) => moveToDocumentEnd(state, event.shift),
  },
  {
    match: on("Home", { shift: "any" }),
    run: (state, event) => moveToLineStart(state, event.shift),
  },
  {
    match: on("End", { shift: "any" }),
    run: (state, event) => moveToLineEnd(state, event.shift),
  },
  {
    match: (event) => event.key === "Backspace" && isLineMod(event),
    run: deleteToLineStart,
  },
  {
    match: (event) => event.key === "Backspace" && isWordMod(event),
    run: deleteWordBackward,
  },
  {
    match: (event) => event.key === "Delete" && isWordMod(event),
    run: deleteWordForward,
  },
  {
    match: on("Backspace"),
    run: deleteBackward,
  },
  {
    match: on("Delete"),
    run: deleteForward,
  },
  {
    match: on("Enter"),
    run: (state) => insertText(state, "\n"),
  },
  {
    match: on("a", { mod: true }),
    run: selectAll,
  },
  {
    match: on("A", { mod: true, shift: true }),
    run: selectAll,
  },
  {
    match: on("*", { shift: "any" }),
    run: (state, event) => insertText(state, event.key),
  },
]
