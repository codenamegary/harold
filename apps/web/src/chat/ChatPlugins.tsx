import React from "react"
import {
  CaretRange,
  Plugin,
  rangeTouches,
  Token,
} from "../design-system/prompt.input.model"
import {
  chatTokenKind,
  looksComplete,
  matchCommand,
  matchMention,
} from "./token.match"

const MENTION_CHIP_CHARS = 8

const commandChipClass =
  "cursor-text rounded-[3px] bg-hover-surface px-0.5 text-lime"

const mentionChipClass =
  "cursor-text rounded-[3px] border border-line-soft bg-hover-surface px-0.5 text-violet"

const mentionLabel = (value: string): string => {
  if (value.length <= MENTION_CHIP_CHARS) {
    return value
  }
  return `${value.slice(0, MENTION_CHIP_CHARS)}…`
}

type PaintChipParams = {
  token: Token
  selection: CaretRange
  raw: string
  chars: React.ReactNode
  className: string
  collapsedText: string
  title?: string
}

const paintChip = (params: PaintChipParams): React.ReactNode => {
  const { token, selection, raw, chars, className, collapsedText, title } =
    params
  if (!looksComplete(token, raw)) {
    return chars
  }
  if (rangeTouches(token, selection)) {
    return <span className={className}>{chars}</span>
  }
  return (
    <span
      data-token-start={token.start}
      className={className}
      title={title}
    >
      {collapsedText}
    </span>
  )
}

const textPlugin: Plugin = {
  kind: chatTokenKind.text,
  render: ({ chars }) => chars,
}

const commandPlugin: Plugin = {
  kind: chatTokenKind.command,
  match: matchCommand,
  render: ({ token, selection, raw, chars }) =>
    paintChip({
      token,
      selection,
      raw,
      chars,
      className: commandChipClass,
      collapsedText: token.value,
    }),
}

const mentionPlugin: Plugin = {
  kind: chatTokenKind.mention,
  match: matchMention,
  render: ({ token, selection, raw, chars }) =>
    paintChip({
      token,
      selection,
      raw,
      chars,
      className: mentionChipClass,
      collapsedText: mentionLabel(token.value),
      title: token.value,
    }),
}

//export const chatPlugins: Plugin[] = [textPlugin, commandPlugin, mentionPlugin]
export const chatPlugins: Plugin[] = [textPlugin]
