import React, { useMemo, useRef, useState } from "react"
import { ConfigOption, ConfigOptionValue } from "contracts/http/config.options"
import { useAtomValue } from "jotai"
import {
  ArrowUp,
  Paperclip,
  ImagePlus,
  Check,
  RotateCcw,
  X,
  LoaderCircle,
  Square,
} from "lucide-react"
import { PromptInput } from "../../design-system/PromptInput"
import { availableCommandsAtom } from "../live/atoms"
import { PendingAttachment } from "../live/use.attachments"
import { createChatPlugins } from "./ChatPlugins"
import { modeBorderClass } from "../config/mode.colors"
import { SessionConfigRow } from "../config/SessionConfigRow"

export type ChatComposerConfig = {
  model?: ConfigOption
  mode?: ConfigOption
  thinking?: ConfigOption
  error?: string | null
  saving?: boolean
  onModelPick: (value: string) => void
  onModeCycle: (next: ConfigOptionValue) => void
  onThinkingCycle: (next: ConfigOptionValue) => void
}

type ChatComposerProps = {
  disabled: boolean
  running: boolean
  blockedMessage: string | null
  supportsImages: boolean
  supportsFiles: boolean
  attachments: ReadonlyArray<PendingAttachment>
  onFilesPicked: (files: FileList | File[]) => void
  onRemoveAttachment: (localId: string) => void
  onRetryAttachment: (localId: string) => void
  onSend: (text: string) => void
  onCancel: () => void
  config?: ChatComposerConfig
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`

const AttachmentChip: React.FC<{
  attachment: PendingAttachment
  onRemove: (localId: string) => void
  onRetry: (localId: string) => void
}> = ({ attachment, onRemove, onRetry }) => (
  <span
    className={`inline-flex max-w-55 items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-body ${
      attachment.status === "failed"
        ? "border-danger/40 bg-danger/10"
        : "border-line-input bg-panel-elevated"
    } ${attachment.status === "uploading" ? "opacity-75" : ""}`}
  >
    {attachment.kind === "image" && attachment.previewUrl !== undefined ? (
      <img src={attachment.previewUrl} alt="" className="size-5 shrink-0 rounded object-cover" />
    ) : (
      <Paperclip aria-hidden className="size-3 shrink-0 text-dim" />
    )}
    <span className="truncate">{attachment.name}</span>
    <span className="shrink-0 font-mono text-xs text-dim">{formatSize(attachment.size)}</span>
    {attachment.status === "uploading" ? (
      <LoaderCircle aria-hidden className="size-3 shrink-0 animate-spin text-dim" />
    ) : attachment.status === "ready" ? (
      <Check aria-hidden className="size-3 shrink-0 text-lime" aria-label="Uploaded" />
    ) : (
      <button
        type="button"
        aria-label={`Retry upload of ${attachment.name}`}
        title={attachment.error ?? "Upload failed"}
        onClick={() => onRetry(attachment.localId)}
        className="shrink-0 text-danger/90"
      >
        <RotateCcw aria-hidden className="size-3" />
      </button>
    )}
    <button
      type="button"
      aria-label={`Remove ${attachment.name}`}
      onClick={() => onRemove(attachment.localId)}
      className="shrink-0 text-dim hover:text-body"
    >
      <X aria-hidden className="size-3" />
    </button>
  </span>
)

export const ChatComposer: React.FC<ChatComposerProps> = ({
  disabled,
  running,
  blockedMessage,
  supportsImages,
  supportsFiles,
  attachments,
  onFilesPicked,
  onRemoveAttachment,
  onRetryAttachment,
  onSend,
  onCancel,
  config,
}) => {
  const [value, setValue] = useState("")
  const [dragOver, setDragOver] = useState(false)
  const commands = useAtomValue(availableCommandsAtom)
  const plugins = useMemo(() => createChatPlugins({ commands }), [commands])
  const imageInputRef = useRef<HTMLInputElement>(null)
  const filesInputRef = useRef<HTMLInputElement>(null)
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

  const handleFilePaste = (files: File[]): boolean => {
    if (files.length === 0) {
      return false
    }
    onFilesPicked(files)
    return true
  }

  const attachButton =
    "pointer-events-auto grid size-7 place-items-center rounded-md text-dim hover:bg-panel-elevated enabled:hover:text-body"

  return (
    <div className="relative mx-auto w-[min(840px,calc(100%-40px))] max-[820px]:w-[calc(100%-20px)]">
      <div
        className={`relative cursor-text rounded-lg border bg-surface-deep shadow-toast ${
          dragOver ? "border-lime" : "border-line-modal"
        } ${(() => {
          const border = modeBorderClass(
            config?.mode?.type === "select" ? config.mode.currentValue : "",
          )
          return border === undefined ? "" : `border-l-4 ${border}`
        })()}`}
        onMouseDown={focusPrompt}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragOver(false)
          onFilesPicked(event.dataTransfer.files)
        }}
      >
        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 px-3.5 pt-3">
            {attachments.map((attachment) => (
              <AttachmentChip
                key={attachment.localId}
                attachment={attachment}
                onRemove={onRemoveAttachment}
                onRetry={onRetryAttachment}
              />
            ))}
          </div>
        ) : null}
        <PromptInput
          aria-label="Chat message"
          placeholder="Ask the agent…"
          value={value}
          onChange={setValue}
          plugins={plugins}
          disabled={!editing}
          className={`block min-h-22 max-h-32.5 w-full overflow-auto px-3.5 pb-10.5 pt-3.5 text-base leading-normal text-body ${
            attachments.length > 0 ? "min-h-16" : ""
          }`}
          onFilePaste={handleFilePaste}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canSend) {
              event.preventDefault()
              handleSend()
            }
          }}
        />

        {/**------------------------- COMPOSER FOOTER -------------------------**/}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-9.5 items-center justify-between gap-3 px-2 pb-1.5 pl-3 pr-2">
          <div className="flex min-w-0 items-center gap-1 text-xs text-dim">
            <button
              type="button"
              aria-label="Attach photo"
              title={
                supportsImages
                  ? "Attach Images"
                  : "Attach Images - Sorry, this agent does not support image attachments."
              }
              disabled={!editing || !supportsImages}
              onClick={() => imageInputRef.current?.click()}
              className={attachButton}
            >
              <ImagePlus aria-hidden className="size-4" />
            </button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              aria-hidden
              onChange={(changeEvent) => {
                const files = changeEvent.target.files
                const target = changeEvent.currentTarget
                if (files !== null) {
                  onFilesPicked(files)
                }
                target.value = ""
              }}
            />
            <button
              type="button"
              aria-label="Attach files"
              title={
                supportsFiles
                  ? "Attach Files"
                  : "Attach Files - Sorry, this agent does not support file attachments."
              }
              disabled={!editing || !supportsFiles}
              onClick={() => filesInputRef.current?.click()}
              className={attachButton}
            >
              <Paperclip aria-hidden className="size-4" aria-disabled={!supportsFiles} />
            </button>
            <input
              ref={filesInputRef}
              type="file"
              multiple
              className="hidden"
              aria-hidden
              onChange={(changeEvent) => {
                const files = changeEvent.target.files
                const target = changeEvent.currentTarget
                if (files !== null) {
                  onFilesPicked(files)
                }
                target.value = ""
              }}
            />
            <SessionConfigRow
              model={config?.model}
              mode={config?.mode}
              thinking={config?.thinking}
              saving={config?.saving}
              onModelPick={config?.onModelPick ?? (() => undefined)}
              onModeCycle={config?.onModeCycle ?? (() => undefined)}
              onThinkingCycle={config?.onThinkingCycle ?? (() => undefined)}
              disabled={blockedMessage !== null}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-dim">
            <span>
              <kbd className="rounded-sm border border-line-input bg-surface-raised px-1 py-px font-mono text-xs text-muted">
                ⌘
              </kbd>{" "}
              <kbd className="rounded-sm border border-line-input bg-surface-raised px-1 py-px font-mono text-xs text-muted">
                ↵
              </kbd>
            </span>
            {running ? (
              <button
                type="button"
                aria-label="Cancel turn"
                onClick={onCancel}
                className="pointer-events-auto grid size-7 place-items-center rounded-md border-0 bg-danger/15 text-sm font-bold text-danger/90"
              >
                <Square aria-hidden className="size-3 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Send message"
                disabled={!canSend}
                onClick={handleSend}
                className="pointer-events-auto grid size-7 place-items-center rounded-md border-0 bg-lime text-sm font-bold text-lime-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ArrowUp aria-hidden className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex h-7.5 items-center justify-end font-mono text-xs text-dim">
        {config?.error ? (
          <span className="text-danger">{config.error}</span>
        ) : blockedMessage !== null ? (
          <span className="text-body-soft">{blockedMessage}</span>
        ) : (
          <span>Prompts run locally on this machine</span>
        )}
      </div>
    </div>
  )
}
