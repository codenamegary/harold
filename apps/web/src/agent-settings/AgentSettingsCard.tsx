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
  "inline-flex min-h-9 items-center justify-center gap-3 rounded-[7px] bg-transparent px-0 text-sm font-semibold whitespace-nowrap text-body-soft transition-opacity duration-300 ease-out hover:text-lime cursor-pointer disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50"

const DetectSuccessCheck: React.FC = () => (
  <svg viewBox="0 0 16 16" aria-hidden className="size-3.5 shrink-0 text-lime animate-detect-path-check">
    <path
      fill="currentColor"
      d="M6.2 11.1 3.4 8.3l-1 1 3.8 3.8 7.4-7.4-1-1z"
    />
  </svg>
)

const toggleClassName =
  "relative h-[17px] w-[31px] shrink-0 cursor-pointer appearance-none rounded-[10px] bg-[#252c36] transition after:absolute after:left-[2px] after:top-[2px] after:size-[13px] after:rounded-full after:bg-[#727c89] after:transition-all after:content-[''] checked:bg-lime checked:after:left-[16px] checked:after:bg-lime-ink disabled:cursor-not-allowed disabled:opacity-50"

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

export const AgentSettingsCard: React.FC<AgentSettingsCardProps> = ({
  agent,
  controlsDisabled,
  updateMutation,
  detectMutation,
}) => {
  const savedPath = agent.path ?? ""
  const [draftPath, setDraftPath] = useState(savedPath)
  const [detectSuccessVisible, setDetectSuccessVisible] = useState(false)

  useEffect(() => {
    setDraftPath(savedPath)
  }, [savedPath])

  useEffect(() => {
    if (!detectSuccessVisible) {
      return undefined
    }

    const timer = setTimeout(() => setDetectSuccessVisible(false), 1350)
    return () => clearTimeout(timer)
  }, [detectSuccessVisible])

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

  const isDetecting =
    detectMutation.isPending && detectMutation.variables === agent.id
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
    setDetectSuccessVisible(false)
    updateMutation.reset()
    detectMutation.reset()
    detectMutation.mutate(agent.id, {
      onSuccess: (result) => {
        setDraftPath(result.path)
        detectMutation.reset()
        setDetectSuccessVisible(true)
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
      className={`rounded-[9px] border p-4 ${isComingSoon ? "border-line-soft bg-[#0a0c10] opacity-55" : "border-lime/35 bg-[linear-gradient(145deg,rgba(182,243,107,0.04),#0b0e13)]"}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="m-0 text-base font-semibold">{agent.displayName}</h4>
        {isComingSoon ? (
          <span className="rounded-[5px] border border-line-soft bg-panel-elevated px-2 py-1 font-mono text-2xs text-dim">
            Coming soon
          </span>
        ) : (
          <input
            type="checkbox"
            checked={agent.enabled}
            disabled={toggleDisabled}
            aria-label={`Enable ${agent.displayName}`}
            onChange={handleToggle}
            className={toggleClassName}
          />
        )}
      </div>

      <div>
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
          <span className="inline-flex min-h-9 items-center gap-1.5">
            <button
              type="button"
              className={`${textLinkClassName}${isDetecting ? " pointer-events-none opacity-20" : ""}`}
              disabled={pathControlsDisabled || isDetecting}
              aria-busy={isDetecting}
              onClick={handleDetectPath}
            >
              Detect path
            </button>
            {detectSuccessVisible ? <DetectSuccessCheck /> : null}
          </span>
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
