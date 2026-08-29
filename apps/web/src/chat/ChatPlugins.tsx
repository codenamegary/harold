import { Plugin, rangeTouches } from "../design-system/prompt.input.model"
import {
  chatTokenKind,
  looksComplete,
  matchCommand,
  matchMention,
} from "./token.match"

const MENTION_CHIP_CHARS = 8

const mentionLabel = (value: string): string => {
  if (value.length <= MENTION_CHIP_CHARS) {
    return value
  }
  return `${value.slice(0, MENTION_CHIP_CHARS)}…`
}

const textPlugin: Plugin = {
  kind: chatTokenKind.text,
  render: ({ token }) => token.value,
}

const commandPlugin: Plugin = {
  kind: chatTokenKind.command,
  match: matchCommand,
  render: ({ token, selection, raw }) => {
    if (!looksComplete(token, raw) || rangeTouches(token, selection)) {
      return token.value
    }

    return (
      <span className="cursor-text rounded-[3px] bg-hover-surface px-0.5 text-lime">
        {token.value}
      </span>
    )
  },
}

const mentionPlugin: Plugin = {
  kind: chatTokenKind.mention,
  match: matchMention,
  render: ({ token, selection, raw }) => {
    if (!looksComplete(token, raw) || rangeTouches(token, selection)) {
      return token.value
    }

    return (
      <span
        title={token.value}
        className="cursor-text rounded-[3px] border border-line-soft bg-hover-surface px-0.5 text-violet"
      >
        {mentionLabel(token.value)}
      </span>
    )
  },
}

export const chatPlugins: Plugin[] = [textPlugin, commandPlugin, mentionPlugin]
