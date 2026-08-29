import React, { useState } from "react"
import { ArrowUp, Square } from "lucide-react"
import { PromptInput } from "../design-system/PromptInput"
import { chatPlugins } from "./ChatPlugins"

type ChatComposerProps = {
  disabled: boolean
  running: boolean
  blockedMessage: string | null
  onSend: (text: string) => void
  onCancel: () => void
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  disabled,
  running,
  blockedMessage,
  onSend,
  onCancel,
}) => {
  const [value, setValue] = useState("")
  const canSend = !disabled && !running && value.trim().length > 0
  const editing = !disabled && !running

  const handleSend = () => {
    const text = value.trim()
    if (text.length === 0 || !canSend) {
      return
    }
    onSend(text)
    setValue("")
  }

  const focusPrompt = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!editing) {
      return
    }
    if (event.target instanceof Element && event.target.closest("button") !== null) {
      return
    }
    event.preventDefault()
    const field = event.currentTarget.querySelector('[role="textbox"]')
    if (field instanceof HTMLElement) {
      field.focus()
    }
  }

  return (
    <div className="relative mx-auto w-[min(840px,calc(100%-40px))] max-[820px]:w-[calc(100%-20px)]">
      <div
        className="relative cursor-text rounded-[9px] border border-[#303845] bg-[#0a0d12] shadow-[0_8px_30px_rgba(0,0,0,0.25)]"
        onMouseDown={focusPrompt}
      >
        <PromptInput
          aria-label="Chat message"
          placeholder="Ask the agent…"
          value={value}
          onChange={setValue}
          plugins={chatPlugins}
          disabled={!editing}
          className="block min-h-[88px] max-h-[130px] w-full overflow-auto px-3.5 pt-3.5 pb-[42px] text-base leading-normal text-body"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canSend) {
              event.preventDefault()
              handleSend()
            }
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[37px] items-center justify-between px-2 pb-1.5 pl-[11px]">
          <div className="flex items-center gap-2.5 text-2xs text-[#4f5865]">
            <span>
              <kbd className="rounded-[3px] border border-[#2e3540] bg-[#151920] px-[3px] py-px font-mono text-2xs text-[#77818e]">
                ⌘
              </kbd>{" "}
              <kbd className="rounded-[3px] border border-[#2e3540] bg-[#151920] px-[3px] py-px font-mono text-2xs text-[#77818e]">
                ↵
              </kbd>{" "}
              to send
            </span>
          </div>
          {running ? (
            <button
              type="button"
              aria-label="Cancel turn"
              onClick={onCancel}
              className="pointer-events-auto grid size-[27px] place-items-center rounded-md border-0 bg-[#3a1d1d] text-sm font-bold text-[#f2a8a8]"
            >
              <Square aria-hidden className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Send message"
              disabled={!canSend}
              onClick={handleSend}
              className="pointer-events-auto grid size-[27px] place-items-center rounded-md border-0 bg-lime text-sm font-bold text-lime-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowUp aria-hidden className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="flex h-[30px] items-center justify-end font-mono text-2xs text-[#414a56]">
        {blockedMessage !== null ? (
          <span className="text-body-soft">{blockedMessage}</span>
        ) : (
          <span>Prompts run locally on this machine</span>
        )}
      </div>
    </div>
  )
}
