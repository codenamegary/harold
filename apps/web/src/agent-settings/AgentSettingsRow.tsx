import React, { useEffect, useState } from "react"
import { UseMutationResult } from "@tanstack/react-query"
import { AgentSettings } from "contracts/http/agent-settings"
import { ChevronDown, Save } from "lucide-react"
import { ActionTextInput } from "../design-system/ActionTextInput"
import { EditableStringList } from "../design-system/EditableStringList"
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

const arraysEqual = (left: readonly string[], right: readonly string[]): boolean => {
  if (left.length !== right.length) {
    return false
  }

  return left.every((item, index) => item === right[index])
}

const truncateMiddle = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value
  }

  if (maxLength <= 1) {
    return "…"
  }

  return `${value.slice(0, maxLength - 1)}…`
}

const formatLaunchSummary = (path: string | null, args: readonly string[]): string => {
  const pathPart = path === null || path === "" ? "—" : path
  if (args.length === 0) {
    return truncateMiddle(pathPart, 52)
  }

  const argsJoined = args.join(" ")
  return `${truncateMiddle(pathPart, 28)} ${truncateMiddle(argsJoined, 24)}`
}

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
  const savedArgs = agent.args
  const [expanded, setExpanded] = useState(false)
  const [draftPath, setDraftPath] = useState(savedPath)
  const [draftArgs, setDraftArgs] = useState<string[]>([...savedArgs])
  const [detectSuccessVisible, setDetectSuccessVisible] = useState(false)

  useEffect(() => {
    setDraftPath(savedPath)
  }, [savedPath])

  useEffect(() => {
    setDraftArgs([...savedArgs])
  }, [savedArgs])

  const isComingSoon = !agent.available
  const rowDisabled = controlsDisabled || isComingSoon
  const pathControlsDisabled = rowDisabled || !agent.enabled
  const argsControlsDisabled = rowDisabled
  const toggleDisabled = rowDisabled || updateMutation.isPending
  const pathChanged = draftPath.trim() !== "" && draftPath !== savedPath
  const argsChanged = !arraysEqual(draftArgs, savedArgs)
  const canSavePath = agent.enabled && pathChanged && !updateMutation.isPending
  const canSaveArgs = argsChanged && !updateMutation.isPending

  const updateErrorForAgent =
    updateMutation.isError && updateMutation.variables?.agentId === agent.id
      ? agentSettingsUpdateErrorMessage(updateMutation.error, "")
      : ""
  const mutationBody = updateMutation.variables?.body
  const isArgsOnlyMutation =
    mutationBody !== undefined && "args" in mutationBody && !("path" in mutationBody)
  const pathError = updateErrorForAgent !== "" && !isArgsOnlyMutation ? updateErrorForAgent : ""
  const argsError = updateErrorForAgent !== "" && isArgsOnlyMutation ? updateErrorForAgent : ""

  const detectError =
    detectMutation.isError && detectMutation.variables === agent.id
      ? agentPathDetectErrorMessage(detectMutation.error, "")
      : ""

  const isDetecting =
    detectMutation.isPending && detectMutation.variables === agent.id

  useEffect(() => {
    if (pathError !== "" || detectError !== "" || argsError !== "") {
      setExpanded(true)
    }
  }, [pathError, detectError, argsError])

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

  const handleSaveArgs = () => {
    updateMutation.mutate(
      {
        agentId: agent.id,
        body: { enabled: agent.enabled, args: draftArgs },
      },
      {
        onSuccess: () => {
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

  const handleArgsChange = (next: string[]) => {
    setDraftArgs(next)
    if (updateMutation.isError) {
      updateMutation.reset()
    }
  }

  const launchSummary = formatLaunchSummary(agent.path, agent.args)
  const expandLabel = expanded
    ? `Collapse ${agent.displayName} launch settings`
    : `Expand ${agent.displayName} launch settings`

  return (
    <>
      <tr
        aria-label={`${agent.displayName} agent`}
        aria-disabled={isComingSoon ? "true" : undefined}
        className={`border-b border-line-soft ${expanded ? "" : "last:border-b-0"} ${isComingSoon ? "opacity-55" : ""}`}
      >
        <td className="px-3 py-2 align-middle">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-expanded={expanded}
              aria-label={expandLabel}
              className="grid size-6 shrink-0 place-items-center rounded text-dim transition-colors hover:text-lime cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              disabled={controlsDisabled}
              onClick={() => setExpanded((current) => !current)}
            >
              <ChevronDown
                aria-hidden
                className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                strokeWidth={1.75}
              />
            </button>
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
          <span
            aria-label={`${agent.displayName} launch summary`}
            className="block truncate font-mono text-2xs text-dim"
            title={agent.path === null ? undefined : `${agent.path}${agent.args.length > 0 ? ` ${agent.args.join(" ")}` : ""}`}
          >
            {launchSummary}
          </span>
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
      {expanded ? (
        <tr
          aria-label={`${agent.displayName} launch settings`}
          className={`border-b border-line-soft last:border-b-0 ${isComingSoon ? "opacity-55" : ""}`}
        >
          <td colSpan={4} className="bg-[#0a0c10] px-3 py-3">
            <div className="flex flex-col gap-4 pl-8">
              <div className="min-w-0 max-w-xl">
                <p className="m-0 mb-1.5 text-2xs font-medium tracking-wide text-label">Path</p>
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

              <div className="min-w-0 max-w-xl">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="m-0 text-2xs font-medium tracking-wide text-label">Args</p>
                  <button
                    type="button"
                    className={textLinkClassName}
                    disabled={!canSaveArgs || argsControlsDisabled}
                    aria-label={`Save ${agent.displayName} args`}
                    onClick={handleSaveArgs}
                  >
                    Save args
                  </button>
                </div>
                <EditableStringList
                  value={draftArgs}
                  onChange={handleArgsChange}
                  disabled={argsControlsDisabled || updateMutation.isPending}
                  aria-label={`${agent.displayName} args`}
                />
                {argsError ? (
                  <p className="m-0 mt-1 text-2xs text-red-400" role="alert">
                    {argsError}
                  </p>
                ) : null}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}
