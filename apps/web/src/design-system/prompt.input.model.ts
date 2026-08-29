import React from "react"

export type Token = {
  kind: string
  value: string
  start: number
  end: number
}

export type Matcher = (text: string, offset: number) => Token | null

export type CaretRange = {
  anchor: number
  focus: number
}

export type EditorState = CaretRange & {
  value: string
}

export type PluginRenderProps = {
  token: Token
  caret: number
  selection: CaretRange
  raw: string
  chars: React.ReactNode
}

export type Plugin = {
  kind: string
  match?: Matcher
  render: (props: PluginRenderProps) => React.ReactNode
}

export const clampCaret = (caret: number, length: number): number =>
  Math.min(Math.max(0, caret), length)

export const clampRange = (range: CaretRange, length: number): CaretRange => ({
  anchor: clampCaret(range.anchor, length),
  focus: clampCaret(range.focus, length),
})

export const collapse = (offset: number): CaretRange => ({
  anchor: offset,
  focus: offset,
})

export const selectionStart = (range: CaretRange): number =>
  Math.min(range.anchor, range.focus)

export const selectionEnd = (range: CaretRange): number =>
  Math.max(range.anchor, range.focus)

export const selectionIsCollapsed = (range: CaretRange): boolean =>
  range.anchor === range.focus

export const selectedText = (state: EditorState): string =>
  state.value.slice(selectionStart(state), selectionEnd(state))

export const offsetIsSelected = (range: CaretRange, offset: number): boolean =>
  !selectionIsCollapsed(range) &&
  offset >= selectionStart(range) &&
  offset < selectionEnd(range)

export const caretIsInside = (token: Token, caret: number): boolean =>
  caret >= token.start && caret <= token.end

export const rangeTouches = (token: Token, range: CaretRange): boolean => {
  if (selectionIsCollapsed(range)) {
    return caretIsInside(token, range.focus)
  }
  return selectionStart(range) < token.end && selectionEnd(range) > token.start
}

export const pluginMap = (plugins: Plugin[]): ReadonlyMap<string, Plugin> => {
  return new Map(plugins.map((plugin) => [plugin.kind, plugin]))
}

const textKindOf = (plugins: Plugin[]): string => {
  const [textPlugin, extra] = plugins.filter(
    (plugin) => plugin.match === undefined,
  )
  if (textPlugin === undefined || extra !== undefined) {
    throw new Error(
      "PromptInput: exactly one plugin without match is required for text spans",
    )
  }
  return textPlugin.kind
}

const matchAt = (text: string, offset: number, plugins: Plugin[]): Token | null =>
  plugins.reduce<Token | null>((found, plugin) => {
    if (found !== null) {
      return found
    }

    const token = plugin.match?.(text, offset) ?? null
    if (token === null) {
      return null
    }
    if (token.start !== offset || token.end <= offset) {
      throw new Error("PromptInput: match must consume from the current offset")
    }
    return { ...token, kind: plugin.kind }
  }, null)

const findNextMatch = (text: string, from: number, plugins: Plugin[]): number => {
  if (from >= text.length) {
    return -1
  }
  if (matchAt(text, from, plugins) !== null) {
    return from
  }
  return findNextMatch(text, from + 1, plugins)
}

const scanFrom = (text: string, offset: number, plugins: Plugin[], textKind: string): Token[] => {
  if (offset >= text.length) {
    return []
  }

  const matched = matchAt(text, offset, plugins)
  if (matched !== null) {
    return [matched, ...scanFrom(text, matched.end, plugins, textKind)]
  }

  const next = findNextMatch(text, offset + 1, plugins)
  const end = next === -1 ? text.length : next
  return [
    {
      kind: textKind,
      value: text.slice(offset, end),
      start: offset,
      end,
    },
    ...scanFrom(text, end, plugins, textKind),
  ]
}

export const scanTokens = (text: string, plugins: Plugin[]): Token[] => {
  const textKind = textKindOf(plugins)
  if (text.length === 0) {
    return []
  }
  return scanFrom(text, 0, plugins, textKind)
}

export const requirePlugin = (
  plugins: ReadonlyMap<string, Plugin>,
  kind: string,
): Plugin => {
  const plugin = plugins.get(kind)
  if (plugin === undefined) {
    throw new Error(`PromptInput: no plugin registered for token kind "${kind}"`)
  }
  return plugin
}

export const assertTokensMatchValue = (value: string, tokens: Token[]): void => {
  const joined = tokens.map((token) => token.value).join("")
  if (joined !== value) {
    throw new Error("PromptInput: tokens must concatenate to value")
  }

  const coverage = tokens.reduce((offset, token) => {
    if (
      token.start !== offset ||
      token.end !== offset + token.value.length ||
      token.value !== value.slice(token.start, token.end)
    ) {
      throw new Error(
        "PromptInput: token offsets must be contiguous and match token.value",
      )
    }
    return token.end
  }, 0)

  if (coverage !== value.length) {
    throw new Error("PromptInput: tokens must cover the full value")
  }
}

export const editorAt = (value: string, caret: number): EditorState => ({
  value,
  ...collapse(caret),
})

export const insertText = (state: EditorState, text: string): EditorState => {
  const start = selectionStart(state)
  const end = selectionEnd(state)
  const caret = start + text.length
  return {
    value: state.value.slice(0, start) + text + state.value.slice(end),
    ...collapse(caret),
  }
}

export const deleteRange = (state: EditorState): EditorState => insertText(state, "")

export const deleteBackward = (state: EditorState): EditorState => {
  if (!selectionIsCollapsed(state)) {
    return deleteRange(state)
  }
  if (state.focus === 0) {
    return state
  }
  return insertText(
    { ...state, anchor: state.focus - 1, focus: state.focus },
    "",
  )
}

export const deleteForward = (state: EditorState): EditorState => {
  if (!selectionIsCollapsed(state)) {
    return deleteRange(state)
  }
  if (state.focus >= state.value.length) {
    return state
  }
  return insertText(
    { ...state, anchor: state.focus, focus: state.focus + 1 },
    "",
  )
}

export const moveFocus = (
  state: EditorState,
  nextFocus: number,
  extend: boolean,
): EditorState => {
  const focus = clampCaret(nextFocus, state.value.length)
  if (extend) {
    return { ...state, focus }
  }
  return { ...state, ...collapse(focus) }
}

export const moveByChar = (
  state: EditorState,
  direction: -1 | 1,
  extend: boolean,
): EditorState => {
  if (!extend && !selectionIsCollapsed(state)) {
    const edge = direction === -1 ? selectionStart(state) : selectionEnd(state)
    return { ...state, ...collapse(edge) }
  }
  return moveFocus(state, state.focus + direction, extend)
}

export const lineBounds = (
  value: string,
  offset: number,
): { start: number; end: number } => {
  const start = value.lastIndexOf("\n", offset - 1) + 1
  const nl = value.indexOf("\n", offset)
  const end = nl === -1 ? value.length : nl
  return { start, end }
}

export const moveToLineStart = (state: EditorState, extend: boolean): EditorState =>
  moveFocus(state, lineBounds(state.value, state.focus).start, extend)

export const moveToLineEnd = (state: EditorState, extend: boolean): EditorState =>
  moveFocus(state, lineBounds(state.value, state.focus).end, extend)

export const moveToDocumentStart = (state: EditorState, extend: boolean): EditorState =>
  moveFocus(state, 0, extend)

export const moveToDocumentEnd = (state: EditorState, extend: boolean): EditorState =>
  moveFocus(state, state.value.length, extend)

const eat = (
  value: string,
  from: number,
  direction: -1 | 1,
  pred: (ch: string) => boolean,
): number => {
  if (direction === -1) {
    if (from < 0) {
      return -1
    }
    if (!pred(value[from] ?? "")) {
      return from
    }
    return eat(value, from - 1, direction, pred)
  }
  if (from >= value.length) {
    return value.length
  }
  if (!pred(value[from] ?? "")) {
    return from
  }
  return eat(value, from + 1, direction, pred)
}

const isSpace = (ch: string) => /\s/.test(ch)
const isNonSpace = (ch: string) => ch.length > 0 && !isSpace(ch)

export const wordLeft = (value: string, from: number): number => {
  const afterSpaces = eat(value, from - 1, -1, isSpace)
  const afterWord = eat(value, afterSpaces, -1, isNonSpace)
  return afterWord + 1
}

export const wordRight = (value: string, from: number): number => {
  const afterSpaces = eat(value, from, 1, isSpace)
  const afterWord = eat(value, afterSpaces, 1, isNonSpace)
  return afterWord
}

export const moveByWord = (
  state: EditorState,
  direction: -1 | 1,
  extend: boolean,
): EditorState => {
  const next =
    direction === -1
      ? wordLeft(state.value, state.focus)
      : wordRight(state.value, state.focus)
  return moveFocus(state, next, extend)
}

export const deleteWordBackward = (state: EditorState): EditorState => {
  if (!selectionIsCollapsed(state)) {
    return deleteRange(state)
  }
  return deleteRange({
    ...state,
    anchor: wordLeft(state.value, state.focus),
    focus: state.focus,
  })
}

export const deleteWordForward = (state: EditorState): EditorState => {
  if (!selectionIsCollapsed(state)) {
    return deleteRange(state)
  }
  return deleteRange({
    ...state,
    anchor: state.focus,
    focus: wordRight(state.value, state.focus),
  })
}

export const deleteToLineStart = (state: EditorState): EditorState => {
  if (!selectionIsCollapsed(state)) {
    return deleteRange(state)
  }
  return deleteRange({
    ...state,
    anchor: lineBounds(state.value, state.focus).start,
    focus: state.focus,
  })
}

export const moveVertically = (
  state: EditorState,
  direction: -1 | 1,
  extend: boolean,
): EditorState => {
  const current = lineBounds(state.value, state.focus)
  const column = state.focus - current.start
  if (direction === -1) {
    if (current.start === 0) {
      return moveFocus(state, 0, extend)
    }
    const previous = lineBounds(state.value, current.start - 1)
    return moveFocus(
      state,
      Math.min(previous.start + column, previous.end),
      extend,
    )
  }
  if (current.end === state.value.length) {
    return moveFocus(state, state.value.length, extend)
  }
  const next = lineBounds(state.value, current.end + 1)
  return moveFocus(state, Math.min(next.start + column, next.end), extend)
}

export const selectAll = (state: EditorState): EditorState => ({
  ...state,
  anchor: 0,
  focus: state.value.length,
})
