/**
 * On-camera typing shared by the walk and `harold_type`.
 *
 * One tap focuses the field. One `adb shell input text` sends each character.
 * The walk stamps `key` on its host clock. The tool calls this same function
 * and passes empty stamp hooks, so the two paths cannot drift.
 */

import { adb } from "./adb"

/**
 * Time from one character to the next. The keystroke's own adb time counts
 * toward it, so a slow `input text` does not add a second wait on top.
 * 160 ms is about six characters a second. A shorter request is raised to 40 ms.
 */
export const TYPE_GAP_FLOOR_MS = 40
export const TYPE_GAP_DEFAULT_MS = 160

/** How long to wait after a keystroke that already took `elapsedMs`. */
export const remainingGapMs = (elapsedMs: number, gapMs: number): number =>
  Math.max(0, gapMs - elapsedMs)

/** Long enough for the cursor to appear before the first character. */
export const FOCUS_SETTLE_MS = 150

export const typeFieldNames = ["host", "user", "port", "name", "composerText"] as const

export type TypeFieldName = (typeof typeFieldNames)[number]

export const sshTypeFields = ["host", "user", "port", "name"] as const satisfies readonly TypeFieldName[]

export const tagByField: Record<TypeFieldName, string> = {
  host: "ssh_host_field",
  user: "ssh_user_field",
  port: "ssh_port_field",
  name: "ssh_name_field",
  composerText: "chat_composer",
}

export const fieldForTag = (tag: string): TypeFieldName | undefined =>
  typeFieldNames.find((field) => tagByField[field] === tag)

export const isTypeFieldName = (value: string): value is TypeFieldName =>
  typeFieldNames.some((field) => field === value)

export const clampTypeGapMs = (requested: number): number =>
  Number.isFinite(requested) && requested >= TYPE_GAP_FLOOR_MS ? requested : TYPE_GAP_FLOOR_MS

/**
 * One argv token for `adb shell input text`.
 *
 * Single quotes are the quoting the device shell leaves alone.
 * An apostrophe closes the quote, escapes itself, and opens a new quote.
 * adb joins shell args itself, so the quoted token is one argv element.
 */
export const escapeInputChunk = (piece: string): string => `'${piece.replaceAll("'", "'\\''")}'`

/**
 * One `input text` token per character.
 * A space is `%s`, the escape `input text` understands.
 * The token stays quoted so the device shell cannot change it.
 */
export const inputTextTokens = (text: string): readonly string[] =>
  [...text].map((character) => escapeInputChunk(character === " " ? "%s" : character))

const fieldNotEmptyError = (field: string, value: string): Error => {
  const error = new Error(
    `FieldNotEmpty: ${field} holds ${JSON.stringify(value)}. Clear it before the recorded slice.`,
  )
  error.name = "FieldNotEmpty"
  return error
}

export const sendInputCharacter = async (character: string): Promise<void> => {
  const tokens = inputTextTokens(character)
  const token = tokens[0]
  if (token === undefined || tokens.length !== 1) {
    throw new Error(`expected one input token for ${JSON.stringify(character)}`)
  }
  await adb(["shell", "input", "text", token], { retry: false })
}

/**
 * Delete `current` from the focused field, one backspace at a time.
 * Used when the app has already written a suggestion, so the recorded
 * field can be typed over. Does not send BACK. BACK leaves the form.
 */
export const clearFieldText = async (current: string): Promise<void> => {
  await adb(["shell", "input", "keyevent", "KEYCODE_MOVE_END"], { retry: false })
  for (let remaining = [...current].length; remaining > 0; remaining -= 1) {
    await adb(["shell", "input", "keyevent", "KEYCODE_DEL"], { retry: false })
  }
}

export type TypeIntoFieldDeps = Readonly<{
  readFact: (field: TypeFieldName) => Promise<string>
  focus: (tag: string) => Promise<void>
  sendCharacter: (character: string) => Promise<void>
  clearField: (current: string) => Promise<void>
  stampKey: () => void
  stampKeysDone: () => void
  sleep: (ms: number) => Promise<void>
  gapMs: number
  /** Clock for the gap. Tests pin it. The walk uses `Date.now`. */
  now?: () => number
  /** When the field holds a suggestion, backspace it and type over it. */
  replace: boolean
}>

/**
 * Focus `field`, type `text` one character at a time, and require an exact fact.
 * The fact must already be empty, unless `replace` is set. Replace backspaces
 * a suggestion the app wrote, then types. This does not append onto other text.
 */
export const typeIntoField = async (
  field: TypeFieldName,
  text: string,
  deps: TypeIntoFieldDeps,
): Promise<string> => {
  await deps.focus(tagByField[field])
  await deps.sleep(FOCUS_SETTLE_MS)
  const current = await deps.readFact(field)
  if (current !== "") {
    if (!deps.replace) {
      throw fieldNotEmptyError(field, current)
    }
    await deps.clearField(current)
  }
  const gapMs = clampTypeGapMs(deps.gapMs)
  const now = deps.now ?? Date.now
  for (const character of [...text]) {
    const started = now()
    deps.stampKey()
    await deps.sendCharacter(character)
    await deps.sleep(remainingGapMs(now() - started, gapMs))
  }
  deps.stampKeysDone()
  const landed = await deps.readFact(field)
  if (landed !== text) {
    throw new Error(`${field} holds ${JSON.stringify(landed)} after typing ${JSON.stringify(text)}`)
  }
  return landed
}
