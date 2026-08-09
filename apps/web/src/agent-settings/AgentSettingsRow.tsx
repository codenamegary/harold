import React, { useEffect, useState } from "react"
import { UseMutationResult } from "@tanstack/react-query"
import { AgentSettings } from "contracts/http/agent-settings"
import { Save } from "lucide-react"
import { ActionTextInput } from "../design-system/ActionTextInput"
import {
  agentPathDetectErrorMessage,
  agentSettingsUpdateErrorMessage,
} from "./agent.settings.mutation.error.message"
import { detectAgentPath } from "./detect.agent.path"
import { updateAgentSettings } from "./update.agent.settings"

const textLinkClassName =
  "inline-flex min-h-6 items-center justify-center gap-1 rounded-[7px] bg-transparent px-0 text-2xs font-semibold whitespace-nowrap text-body-soft transition-opacity duration-300 ease-out hover:text-lime cursor-pointer disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50"

const DetectSuccessCheck: React.FC<{ onAnimationEnd: () => void }> = ({ onAnimationEnd }) => (
  <svg
    viewBox="0 0 16 16"
    aria-hidden
    className="size-3 shrink-0 text-lime animate-detect-path-check"
    onAnimationEnd={onAnimationEnd}
  >
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

type AgentSettingsRowProps = {
  agent: AgentSettings
  controlsDisabled: boolean
  updateMutation: UpdateMutation
  detectMutation: DetectMutation
}

export const AgentSettingsRow: React.FC<AgentSettingsRowProps> = ({
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

  const isComingSoon = !agent.available
  const rowDisabled = controlsDisabled || isComingSoon
  const pathControlsDisabled = rowDisabled || !agent.enabled
  const toggleDisabled = rowDisabled || updateMutation.isPending
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
    <tr
      aria-label={`${agent.displayName} agent`}
      aria-disabled={isComingSoon ? "true" : undefined}
      className={`border-b border-line-soft last:border-b-0 ${isComingSoon ? "opacity-55" : ""}`}
    >
      <td className="px-3 py-2 align-middle">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-body">{agent.displayName}</span>
          {agent.popular ? (
            <span className="shrink-0 rounded-[4px] border border-line-soft px-1 py-px font-mono text-2xs text-dim">
              popular
            </span>
          ) : null}
          {isComingSoon ? (
            <span className="shrink-0 rounded-[4px] border border-line-soft bg-panel-elevated px-1 py-px font-mono text-2xs text-dim">
              Coming soon
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-2 align-middle whitespace-nowrap">
        {agent.present ? (
          <span className="font-mono text-2xs text-lime">present</span>
        ) : (
          <span className="font-mono text-2xs text-dim">not present</span>
        )}
      </td>
      <td className="px-3 py-2 align-middle">
        <div className="min-w-[12rem] max-w-md">
          <ActionTextInput
            id={`${agent.id}-path`}
            aria-label={`${agent.displayName} executable path`}
            value={draftPath}
            readOnly={!agent.enabled && !controlsDisabled}
            disabled={controlsDisabled}
            aria-disabled={pathControlsDisabled}
            placeholder={agent.enabled ? "Executable path" : "Enable to edit path"}
            onChange={(event) => handlePathValueChange(event.target.value)}
            onInput={(event) => handlePathValueChange(event.currentTarget.value)}
            className="text-xs"
            action={{
              "aria-label": updateMutation.isPending ? "Saving path" : "Save path",
              disabled: !canSavePath,
              onClick: handleSavePath,
              children: <Save aria-hidden className="size-3.5" strokeWidth={1.75} />,
            }}
          />
          {pathError ? (
            <p className="m-0 mt-1 text-2xs text-red-400" role="alert">
              {pathError}
            </p>
          ) : null}
          {detectError ? (
            <p className="m-0 mt-1 text-2xs text-red-400" role="alert">
              {detectError}
            </p>
          ) : null}
          <div className="mt-1 flex items-center gap-2">
            <span className="inline-flex min-h-6 items-center gap-1.5">
              <button
                type="button"
                className={`${textLinkClassName}${isDetecting ? " pointer-events-none opacity-20" : ""}`}
                disabled={pathControlsDisabled || isDetecting}
                aria-busy={isDetecting}
                onClick={handleDetectPath}
              >
                Detect path
              </button>
              {detectSuccessVisible ? (
                <DetectSuccessCheck onAnimationEnd={() => setDetectSuccessVisible(false)} />
              ) : null}
            </span>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 align-middle text-right">
        {isComingSoon ? (
          <span className="sr-only">Unavailable</span>
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
      </td>
    </tr>
  )
}
