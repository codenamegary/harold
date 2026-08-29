import { Matcher, Token } from "../design-system/prompt.input.model"

export const chatTokenKind = {
  text: "text",
  command: "command",
  mention: "mention",
} as const

const isTriggerStart = (
  text: string,
  offset: number,
  trigger: string,
): boolean => {
  if (text[offset] !== trigger) {
    return false
  }
  if (offset === 0) {
    return true
  }
  return /\s/.test(text[offset - 1] ?? "")
}

export const matchTrigger = (trigger: string, kind: string): Matcher => {
  const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`^${escaped}\\S*`)
  return (text, offset) => {
    if (!isTriggerStart(text, offset, trigger)) {
      return null
    }
    const matched = text.slice(offset).match(pattern)
    const value = matched?.[0]
    if (value === undefined) {
      return null
    }
    return {
      kind,
      value,
      start: offset,
      end: offset + value.length,
    }
  }
}

export const matchCommand = matchTrigger("/", chatTokenKind.command)

export const matchMention = matchTrigger("@", chatTokenKind.mention)

export const followedByWhitespace = (token: Token, raw: string): boolean => {
  const next = raw[token.end]
  return next !== undefined && /\s/.test(next)
}

export const looksComplete = (token: Token, raw: string): boolean =>
  followedByWhitespace(token, raw) || token.end === raw.length
