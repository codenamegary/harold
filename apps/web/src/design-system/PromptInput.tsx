import React, { useEffect, useRef, useState } from "react"
import { promptKeyHandlers } from "./prompt.input.keyboard"
import {
  assertTokensMatchValue,
  clampCaret,
  clampRange,
  collapse,
  deleteRange,
  EditorState,
  insertText,
  offsetIsSelected,
  pluginMap,
  Plugin,
  requirePlugin,
  scanTokens,
  selectedText,
  selectionIsCollapsed,
} from "./prompt.input.model"
import { offsetFromElement, offsetFromPoint } from "./prompt.input.mouse"
import { useKeyboardInput } from "./use.keyboard.input"

export type PromptInputProps = {
  value: string
  plugins: Plugin[]
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  placeholder?: string
  "aria-label": string
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>
}

export const PromptInput: React.FC<PromptInputProps> = (props) => {
  const {
    value,
    plugins,
    onChange,
    disabled = false,
    className = "",
    placeholder,
    "aria-label": ariaLabel,
    onKeyDown,
  } = props

  const rootRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const [rangeState, setRangeState] = useState(() => collapse(value.length))
  const [focused, setFocused] = useState(false)
  const range = clampRange(rangeState, value.length)
  const caret = range.focus
  const state: EditorState = { value, ...range }
  const tokens = scanTokens(value, plugins)
  assertTokensMatchValue(value, tokens)
  const pluginsByKind = pluginMap(plugins)

  const apply = (next: EditorState) => {
    setRangeState(clampRange(next, next.value.length))
    if (next.value !== value) {
      onChange(next.value)
    }
  }

  const placeOffset = (offset: number, extend: boolean) => {
    const next = clampCaret(offset, value.length)
    setRangeState(extend ? { ...range, focus: next } : collapse(next))
    rootRef.current?.focus()
  }

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) {
      return
    }
    event.preventDefault()
    placeOffset(offsetFromElement(event.target, event.clientX, value.length), event.shiftKey)
    draggingRef.current = true
  }

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!draggingRef.current) {
        return
      }
      const offset = offsetFromPoint(event.clientX, event.clientY, value.length)
      setRangeState((current) => ({
        ...current,
        focus: clampCaret(offset, value.length),
      }))
    }
    const onUp = () => {
      draggingRef.current = false
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [value.length])

  const handleKeyDown = useKeyboardInput({
    handlers: promptKeyHandlers,
    state,
    onState: apply,
    disabled,
    onKeyDown,
  })

  const handleCopy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (selectionIsCollapsed(state)) {
      return
    }
    event.clipboardData.setData("text/plain", selectedText(state))
  }

  const handleCut = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (disabled || selectionIsCollapsed(state)) {
      return
    }
    event.clipboardData.setData("text/plain", selectedText(state))
    apply(deleteRange(state))
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (disabled) {
      return
    }
    apply(insertText(state, event.clipboardData.getData("text/plain")))
  }

  const disabledClasses = disabled ? "opacity-50 pointer-events-none" : ""

  return (
    <div
      ref={rootRef}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline="true"
      aria-placeholder={placeholder}
      aria-disabled={disabled ? "true" : undefined}
      data-placeholder={placeholder}
      tabIndex={disabled ? -1 : 0}
      className={`cursor-text whitespace-pre-wrap outline-none ${disabledClasses} ${className}`}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
      onCopy={handleCopy}
      onCut={handleCut}
      onPaste={handlePaste}
    >
      {value.length === 0 ? (
        <span className="pointer-events-none relative">
          {focused && !disabled ? <Caret /> : null}
          {placeholder !== undefined ? (
            <span className="text-dim">{placeholder}</span>
          ) : null}
        </span>
      ) : (
        tokens.map((token) => {
          const plugin = requirePlugin(pluginsByKind, token.kind)
          const painted = plugin.render({
            token,
            caret,
            selection: range,
            raw: value,
          })
          if (typeof painted === "string") {
            return (
              <span key={token.start}>
                {Array.from(token.value).map((ch, index) => {
                  const offset = token.start + index
                  const atEnd = offset === value.length - 1
                  const selected = offsetIsSelected(range, offset)
                  return (
                    <span key={offset} className="relative">
                      {focused && caret === offset ? <Caret /> : null}
                      <span
                        data-offset={offset}
                        className={selected ? "prompt-input-selected" : undefined}
                      >
                        {ch}
                      </span>
                      {focused && atEnd && caret === value.length ? (
                        <Caret after />
                      ) : null}
                    </span>
                  )
                })}
              </span>
            )
          }
          return (
            <span key={token.start} data-token-start={token.start}>
              {painted}
            </span>
          )
        })
      )}
    </div>
  )
}

const Caret: React.FC<{ after?: boolean }> = ({ after = false }) => (
  <span
    aria-hidden
    className={`prompt-input-caret${after ? " prompt-input-caret-after" : ""}`}
  />
)
