import React from "react"
import { useRef, useState } from "react"
import { ArrowUp, Square } from "lucide-react"

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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [hasText, setHasText] = useState(false)
  const canSend = !disabled && !running && hasText

  const clearDraft = () => {
    if (textareaRef.current !== null) {
      textareaRef.current.value = ""
    }
    setHasText(false)
  }

  const handleSend = () => {
    const text = textareaRef.current?.value.trim() ?? ""
    if (text.length === 0 || !canSend) {
      return
    }
    onSend(text)
    clearDraft()
  }

  return (
    <div className="relative mx-auto w-[min(840px,calc(100%-40px))] max-[820px]:w-[calc(100%-20px)]">
      <div className="rounded-[9px] border border-[#303845] bg-[#0a0d12] shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
        <textarea
          ref={textareaRef}
          aria-label="Chat message"
          disabled={disabled || running}
          rows={1}
          onInput={(event) => {
            setHasText(event.currentTarget.value.trim().length > 0)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canSend) {
              event.preventDefault()
              handleSend()
            }
          }}
          placeholder="Ask the agent…"
          className="block max-h-[130px] w-full resize-none border-0 bg-transparent px-3.5 pt-3.5 pb-[5px] text-base leading-normal text-body outline-0 placeholder:text-[#4d5663] disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="flex h-[37px] items-center justify-between px-2 pb-1.5 pl-[11px]">
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
              className="grid size-[27px] place-items-center rounded-md border-0 bg-[#3a1d1d] text-sm font-bold text-[#f2a8a8]"
            >
              <Square aria-hidden className="size-3 fill-current" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Send message"
              disabled={!canSend}
              onClick={handleSend}
              className="grid size-[27px] place-items-center rounded-md border-0 bg-lime text-sm font-bold text-lime-ink disabled:cursor-not-allowed disabled:opacity-50"
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
