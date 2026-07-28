import React, { useEffect, useState } from "react"
import { UseMutationResult } from "@tanstack/react-query"
import { AgentSettings } from "contracts/http/agent-settings"
import { Button } from "../design-system/Button"
import { FieldLabel } from "../design-system/FieldLabel"
import { TextInput } from "../design-system/TextInput"
import {
  agentPathDetectErrorMessage,
  agentSettingsUpdateErrorMessage,
} from "./agentSettingsMutationErrorMessage"
import { detectAgentPath } from "./detectAgentPath"
import { updateAgentSettings } from "./updateAgentSettings"

const textLinkClassName =
  "inline-flex min-h-9 items-center justify-center gap-3 rounded-[7px] bg-transparent px-0 text-sm font-semibold whitespace-nowrap text-body-soft hover:text-lime disabled:pointer-events-none disabled:opacity-50"

type UpdateMutation = UseMutationResult<
  Awaited<ReturnType<typeof updateAgentSettings>>,
  Error,
  Parameters<typeof updateAgentSettings>[0]
>

type DetectMutation = UseMutationResult<
  Awaited<ReturnType<typeof detectAgentPath>>,
  Error,
  Parameters<typeof detectAgentPath>[0]
>

type AgentSettingsCardProps = {
  agent: AgentSettings
  controlsDisabled: boolean
  updateMutation: UpdateMutation
  detectMutation: DetectMutation
}

const CursorIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-current">
    <path d="M5 3.75 18.25 11 11 12.25 9.75 19.25 5 3.75Z" />
  </svg>
)

const ClaudeIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-5 fill-current">
    <path d="M12 3.5c-1.2 0-2.2.45-3 1.35-.35.4-.62.88-.8 1.42-.18.55-.22 1.12-.12 1.7.1.58.34 1.1.72 1.55.38.45.87.78 1.48.98v.05c-.95.2-1.7.68-2.25 1.45-.55.77-.82 1.65-.82 2.65 0 1.15.4 2.12 1.2 2.9.8.78 1.78 1.17 2.95 1.17 1.15 0 2.12-.38 2.9-1.15.78-.77 1.17-1.73 1.17-2.88 0-1-.28-1.88-.85-2.65-.57-.77-1.32-1.25-2.25-1.45v-.05c.6-.2 1.08-.53 1.45-.98.37-.45.6-.97.7-1.55.1-.58.06-1.15-.12-1.7-.18-.55-.45-1.02-.8-1.42-.8-.9-1.8-1.35-3-1.35Zm0 4.5c.55 0 1 .2 1.35.58.35.38.52.85.52 1.42s-.17 1.05-.52 1.42c-.35.38-.8.58-1.35.58s-1-.2-1.35-.58c-.35-.38-.52-.85-.52-1.42s.17-1.05.52-1.42c.35-.38.8-.58 1.35-.58Zm0 7.25c.72 0 1.3.23 1.75.7.45.47.67 1.05.67 1.75s-.22 1.28-.67 1.75c-.45.47-1.03.7-1.75.7s-1.3-.23-1.75-.7c-.45-.47-.67-1.05-.67-1.75s.22-1.28.67-1.75c.45-.47 1.03-.7 1.75-.7Z" />
  </svg>
)

const agentIconById: Record<AgentSettings["id"], React.ReactNode> = {
  cursor: <CursorIcon />,
  claude: <ClaudeIcon />,
}

const agentDescriptionById: Record<AgentSettings["id"], string> = {
  cursor: "Run Cursor agents through ACP with a local executable path.",
  claude: "Run Claude agents through ACP. Coming in a future release.",
}

export const AgentSettingsCard: React.FC<AgentSettingsCardProps> = ({
  agent,
  controlsDisabled,
  updateMutation,
  detectMutation,
}) => {
  const savedPath = agent.path ?? ""
  const [draftPath, setDraftPath] = useState(savedPath)

  useEffect(() => {
    setDraftPath(savedPath)
  }, [savedPath])

  const isComingSoon = !agent.available
  const cardDisabled = controlsDisabled || isComingSoon
  const pathControlsDisabled = cardDisabled || !agent.enabled
  const toggleDisabled = cardDisabled || updateMutation.isPending
  const pathChanged = draftPath.trim() !== "" && draftPath !== savedPath
  const canSavePath = agent.enabled && pathChanged && !updateMutation.isPending

  const pathError =
    updateMutation.isError && updateMutation.variables?.agentId === agent.id
      ? agentSettingsUpdateErrorMessage(updateMutation.error, "")
      : ""

  const detectError =
    detectMutation.isError && detectMutation.variables === agent.id
      ? agentPathDetectErrorMessage(detectMutation.error, "")
      : ""

  const handleToggle = () => {
    updateMutation.mutate(
      {
        agentId: agent.id,
        body: { enabled: !agent.enabled },
      },
      {
        onSuccess: () => {
          updateMutation.reset()
        },
      },
    )
  }

  const handleSavePath = () => {
    updateMutation.mutate(
      {
        agentId: agent.id,
        body: { enabled: true, path: draftPath.trim() },
      },
      {
        onSuccess: () => {
          setDraftPath(draftPath.trim())
          updateMutation.reset()
        },
      },
    )
  }

  const handleDetectPath = () => {
    detectMutation.mutate(agent.id, {
      onSuccess: (result) => {
        setDraftPath(result.path)
        detectMutation.reset()
      },
    })
  }

  const handlePathValueChange = (value: string) => {
    setDraftPath(value)
    if (updateMutation.isError) {
      updateMutation.reset()
    }
  }

  return (
    <section
      aria-label={`${agent.displayName} agent`}
      aria-disabled={isComingSoon ? "true" : undefined}
      className={`rounded-[9px] border p-5 ${isComingSoon ? "border-line-soft bg-[#0a0c10] opacity-55" : "border-lime/35 bg-[linear-gradient(145deg,rgba(182,243,107,0.04),#0b0e13)]"}`}
    >
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <span className="grid size-9 place-items-center rounded-[7px] border border-line bg-panel-2 text-muted">
          {agentIconById[agent.id]}
        </span>
        {isComingSoon ? (
          <span className="rounded-[5px] border border-line-soft bg-panel-elevated px-2 py-1 font-mono text-2xs text-dim">
            Coming soon
          </span>
        ) : agent.enabled ? (
          <span className="flex items-center gap-1.5 font-mono text-2xs text-lime">
            <span aria-hidden className="size-1.5 rounded-full bg-lime" />
            Enabled
          </span>
        ) : (
          <span className="font-mono text-2xs text-dim">Disabled</span>
        )}
      </div>

      <h4 className="m-0 mb-2 text-base font-semibold">{agent.displayName}</h4>
      <p className="m-0 text-sm leading-[1.55] text-muted">{agentDescriptionById[agent.id]}</p>

      <label className="mt-4 flex items-center justify-between gap-4 border-t border-line-soft pt-4">
        <span>
          <strong className="block text-sm font-medium">Enable agent</strong>
          <small className="mt-1 block text-xs text-muted">
            Allow ACP sessions to start with this agent.
          </small>
        </span>
        <input
          type="checkbox"
          checked={agent.enabled}
          disabled={toggleDisabled}
          aria-label={`Enable ${agent.displayName}`}
          onChange={handleToggle}
          className="size-4 shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        />
      </label>

      <div className="mt-4 border-t border-line-soft pt-4">
        <FieldLabel htmlFor={`${agent.id}-path`} className="mb-2">
          Executable path
        </FieldLabel>
        <TextInput
          id={`${agent.id}-path`}
          value={draftPath}
          readOnly={!agent.enabled && !controlsDisabled}
          disabled={controlsDisabled}
          aria-disabled={pathControlsDisabled}
          placeholder={agent.enabled ? "Enter agent executable path" : "Enable agent to edit path"}
          onChange={(event) => handlePathValueChange(event.target.value)}
          onInput={(event) => handlePathValueChange(event.currentTarget.value)}
        />
        {pathError ? (
          <p className="m-0 mt-2 text-xs text-red-400" role="alert">
            {pathError}
          </p>
        ) : null}
        {detectError ? (
          <p className="m-0 mt-2 text-xs text-red-400" role="alert">
            {detectError}
          </p>
        ) : null}
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            className={textLinkClassName}
            disabled={pathControlsDisabled || detectMutation.isPending}
            onClick={handleDetectPath}
          >
            {detectMutation.isPending ? "Detecting…" : "Detect path"}
          </button>
          <Button
            variant="secondary"
            disabled={!canSavePath}
            onClick={handleSavePath}
          >
            {updateMutation.isPending ? "Saving…" : "Save path"}
          </Button>
        </div>
      </div>
    </section>
  )
}
