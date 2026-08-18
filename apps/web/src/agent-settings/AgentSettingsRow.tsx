import React, { useEffect, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { UseMutationResult } from "@tanstack/react-query"
import { AgentId, AgentSettings } from "contracts/http/agent-settings"
import { ChevronDown, RotateCw, TriangleAlert } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { Button } from "../design-system/Button"
import { ConfirmDeleteIconButton } from "../design-system/ConfirmDeleteIconButton"
import { EditableStringList } from "../design-system/EditableStringList"
import { TextInput } from "../design-system/TextInput"
import {
  AgentLaunchFormSchema,
  AgentLaunchFormValues,
} from "./agent.launch.form.schema"
import {
  agentPathDetectErrorMessage,
  agentRespawnErrorMessage,
  agentSettingsUpdateErrorMessage,
} from "./agent.settings.mutation.error.message"
import {
  agentRuntimeStatusChipClassName,
  agentRuntimeStatusLabels,
} from "./agent.runtime.status"
import { deleteAgentSettings } from "./delete.agent.settings"
import { detectAgentPath } from "./detect.agent.path"
import { formatLaunchCommandPreview } from "./launch.command.preview"
import { insertNpxYesFlag, needsNpxYesFlag } from "./npx.yes.flag"
import { isCustomAgentId } from "./is.custom.agent.id"
import { respawnAgent } from "./respawn.agent"
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

const agentLaunchFormValues = (agent: AgentSettings): AgentLaunchFormValues => ({
  path: agent.path ?? "",
  args: [...agent.args],
})

const trimLaunchFormValues = (data: AgentLaunchFormValues): AgentLaunchFormValues => ({
  path: data.path.trim(),
  args: data.args.map((arg) => arg.trim()).filter((arg) => arg !== ""),
})

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

type DeleteMutation = UseMutationResult<
  Awaited<ReturnType<typeof deleteAgentSettings>>,
  Error,
  AgentId
>

type RespawnMutation = UseMutationResult<
  Awaited<ReturnType<typeof respawnAgent>>,
  Error,
  AgentId
>

type AgentSettingsRowProps = {
  agent: AgentSettings
  controlsDisabled: boolean
  initiallyExpanded: boolean
  updateMutation: UpdateMutation
  detectMutation: DetectMutation
  deleteMutation: DeleteMutation
  respawnMutation: RespawnMutation
}

export const AgentSettingsRow: React.FC<AgentSettingsRowProps> = ({
  agent,
  controlsDisabled,
  initiallyExpanded,
  updateMutation,
  detectMutation,
  deleteMutation,
  respawnMutation,
}) => {
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const [detectSuccessVisible, setDetectSuccessVisible] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(agent.displayName)
  const isCustom = isCustomAgentId(agent.id)

  useEffect(() => {
    if (initiallyExpanded) {
      setExpanded(true)
    }
  }, [initiallyExpanded])

  useEffect(() => {
    setNameDraft(agent.displayName)
  }, [agent.displayName])

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { isDirty, isSubmitting, errors },
  } = useForm<AgentLaunchFormValues>({
    resolver: zodResolver(AgentLaunchFormSchema),
    defaultValues: agentLaunchFormValues(agent),
    values: agentLaunchFormValues(agent),
  })

  const pathValue = watch("path")
  const argsValue = watch("args")
  const commandPreview = formatLaunchCommandPreview(pathValue, argsValue)

  const isComingSoon = !agent.available
  const isDeleting =
    deleteMutation.isPending && deleteMutation.variables === agent.id
  const rowDisabled = controlsDisabled || isComingSoon || isDeleting
  const formControlsDisabled = rowDisabled || updateMutation.isPending
  const toggleDisabled = rowDisabled || updateMutation.isPending
  const showNpxYesWarning = !isComingSoon && needsNpxYesFlag(pathValue, argsValue)

  const updateErrorForAgent =
    updateMutation.isError && updateMutation.variables?.agentId === agent.id
      ? agentSettingsUpdateErrorMessage(updateMutation.error, "")
      : ""

  const detectError =
    detectMutation.isError && detectMutation.variables === agent.id
      ? agentPathDetectErrorMessage(detectMutation.error, "")
      : ""

  const respawnError =
    respawnMutation.isError && respawnMutation.variables === agent.id
      ? agentRespawnErrorMessage(respawnMutation.error, "")
      : ""

  const runtimeError = respawnError !== "" ? respawnError : (agent.state.error ?? "")

  const isDetecting =
    detectMutation.isPending && detectMutation.variables === agent.id

  const isRespawning =
    respawnMutation.isPending && respawnMutation.variables === agent.id

  useEffect(() => {
    if (updateErrorForAgent !== "" || detectError !== "" || runtimeError !== "") {
      setExpanded(true)
    }
  }, [updateErrorForAgent, detectError, runtimeError])

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

  const handleRespawn = () => {
    respawnMutation.mutate(agent.id, {
      onSuccess: () => {
        respawnMutation.reset()
      },
    })
  }

  const onSave = (data: AgentLaunchFormValues) => {
    const next = trimLaunchFormValues(data)

    updateMutation.mutate(
      {
        agentId: agent.id,
        body: {
          enabled: agent.enabled,
          path: next.path,
          args: next.args,
        },
      },
      {
        onSuccess: () => {
          reset(next)
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
        setValue("path", result.path, { shouldDirty: true, shouldValidate: true })
        detectMutation.reset()
        setDetectSuccessVisible(true)
      },
    })
  }

  const handleReset = () => {
    reset(agentLaunchFormValues(agent))
    if (updateMutation.isError) {
      updateMutation.reset()
    }
  }

  const commitRename = () => {
    const nextName = nameDraft.trim()
    setEditingName(false)
    if (nextName === "" || nextName === agent.displayName) {
      setNameDraft(agent.displayName)
      return
    }

    updateMutation.mutate(
      {
        agentId: agent.id,
        body: { displayName: nextName },
      },
      {
        onSuccess: () => {
          updateMutation.reset()
        },
        onError: () => {
          setNameDraft(agent.displayName)
        },
      },
    )
  }

  const handleDelete = () => {
    deleteMutation.mutate(agent.id, {
      onSuccess: () => {
        deleteMutation.reset()
      },
    })
  }

  const launchSummary = formatLaunchSummary(agent.path, agent.args)
  const expandLabel = expanded
    ? `Collapse ${agent.displayName} launch settings`
    : `Expand ${agent.displayName} launch settings`
  const saveDisabled = !isDirty || isSubmitting || updateMutation.isPending
  const pathFieldError = errors.path?.message
  const formError = updateErrorForAgent !== "" ? updateErrorForAgent : ""

  return (
    <>
      <tr
        aria-label={`${agent.displayName} agent`}
        aria-disabled={isComingSoon || isDeleting ? "true" : undefined}
        aria-busy={isDeleting ? "true" : undefined}
        className={`border-b border-line-soft transition-opacity duration-200 ${expanded ? "" : "last:border-b-0"} ${isComingSoon || isDeleting ? "opacity-55" : ""} ${isDeleting ? "pointer-events-none" : ""}`}
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
            {editingName && isCustom ? (
              <TextInput
                aria-label={`Rename ${agent.displayName}`}
                value={nameDraft}
                disabled={formControlsDisabled}
                className="min-w-0 flex-1 text-sm font-semibold"
                autoFocus
                onChange={(event) => setNameDraft(event.target.value)}
                onInput={(event) => setNameDraft(event.currentTarget.value)}
                onBlur={commitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    commitRename()
                  }
                  if (event.key === "Escape") {
                    setNameDraft(agent.displayName)
                    setEditingName(false)
                  }
                }}
              />
            ) : (
              <button
                type="button"
                className={`truncate text-left text-sm font-semibold text-body ${isCustom ? "cursor-pointer hover:text-lime" : "cursor-default"}`}
                disabled={!isCustom || rowDisabled}
                aria-label={isCustom ? `Rename ${agent.displayName}` : undefined}
                onClick={() => {
                  if (!isCustom || rowDisabled) {
                    return
                  }
                  setEditingName(true)
                }}
              >
                {agent.displayName}
              </button>
            )}
            {isCustom ? (
              <span className="shrink-0 rounded-[4px] border border-line-soft px-1 py-px font-mono text-2xs text-dim">
                custom
              </span>
            ) : null}
            {agent.present ? (
              <span className="shrink-0 rounded-[4px] border border-lime/40 px-1 py-px font-mono text-2xs text-lime">
                present
              </span>
            ) : null}
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
        <td className="px-3 py-2 align-middle">
          <span
            aria-label={`${agent.displayName} launch summary`}
            className="block truncate font-mono text-2xs text-dim"
            title={agent.path === null ? undefined : `${agent.path}${agent.args.length > 0 ? ` ${agent.args.join(" ")}` : ""}`}
          >
            {launchSummary}
          </span>
        </td>
        <td className="px-3 py-2 align-middle">
          <div className="flex min-w-0 flex-col gap-1">
            <span
              aria-label={`${agent.displayName} runtime status`}
              className={`w-fit shrink-0 rounded-[4px] border px-1 py-px font-mono text-2xs ${agentRuntimeStatusChipClassName[agent.state.status]}`}
            >
              {agentRuntimeStatusLabels[agent.state.status]}
            </span>
            {runtimeError !== "" ? (
              <p
                className="m-0 max-w-56 truncate text-2xs text-red-400"
                role="alert"
                title={runtimeError}
              >
                {runtimeError}
              </p>
            ) : null}
          </div>
        </td>
        <td className="px-3 py-2 align-middle text-right">
          <div className="inline-flex items-center justify-end gap-2">
            {agent.deletable ? (
              <ConfirmDeleteIconButton
                aria-label={`Delete ${agent.displayName}`}
                disabled={
                  (controlsDisabled || isComingSoon || deleteMutation.isPending) && !isDeleting
                }
                pending={isDeleting}
                onConfirm={handleDelete}
              />
            ) : null}
            {agent.enabled && !isComingSoon ? (
              <button
                type="button"
                aria-label={`Respawn ${agent.displayName}`}
                aria-busy={isRespawning ? "true" : undefined}
                disabled={rowDisabled || isRespawning || updateMutation.isPending}
                className="grid size-6 shrink-0 place-items-center rounded text-dim transition-colors hover:text-lime cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handleRespawn}
              >
                <RotateCw
                  aria-hidden
                  className={`size-3.5 ${isRespawning ? "animate-spin" : ""}`}
                  strokeWidth={1.75}
                />
              </button>
            ) : null}
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
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr
          aria-label={`${agent.displayName} launch settings`}
          aria-busy={isDeleting ? "true" : undefined}
          className={`border-b border-line-soft last:border-b-0 transition-opacity duration-200 ${isComingSoon || isDeleting ? "opacity-55" : ""} ${isDeleting ? "pointer-events-none" : ""}`}
        >
          <td colSpan={4} className="bg-[#0a0c10] px-3 py-3">
            <div className="flex flex-col gap-4 p-4">
              <div className="min-w-0 max-w-xl">
                <p className="m-0 mb-1.5 text-2xs font-medium tracking-wide text-label">Path</p>
                <Controller
                  name="path"
                  control={control}
                  render={({ field }) => (
                    <TextInput
                      id={`${agent.id}-path`}
                      aria-label={`${agent.displayName} executable path`}
                      placeholder="Executable path"
                      disabled={formControlsDisabled}
                      className="text-xs"
                      name={field.name}
                      ref={field.ref}
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={(event) => {
                        field.onChange(event.target.value)
                        if (updateMutation.isError) {
                          updateMutation.reset()
                        }
                      }}
                      onInput={(event) => {
                        field.onChange(event.currentTarget.value)
                        if (updateMutation.isError) {
                          updateMutation.reset()
                        }
                      }}
                    />
                  )}
                />
                {pathFieldError ? (
                  <p className="m-0 mt-1 text-2xs text-red-400" role="alert">
                    {pathFieldError}
                  </p>
                ) : null}
                {formError ? (
                  <p className="m-0 mt-1 text-2xs text-red-400" role="alert">
                    {formError}
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
                      disabled={rowDisabled || isDetecting}
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
                <p className="m-0 mb-1.5 text-2xs font-medium tracking-wide text-label">Args</p>
                <Controller
                  name="args"
                  control={control}
                  render={({ field }) => (
                    <EditableStringList
                      value={field.value}
                      onChange={(next) => {
                        setValue("args", next, { shouldDirty: true, shouldValidate: true })
                        if (updateMutation.isError) {
                          updateMutation.reset()
                        }
                      }}
                      disabled={formControlsDisabled}
                      sortable
                      aria-label={`${agent.displayName} args`}
                    />
                  )}
                />
                {showNpxYesWarning ? (
                  <p
                    className="m-0 mt-1.5 flex items-start gap-1.5 text-2xs text-amber-200"
                    role="status"
                  >
                    <TriangleAlert
                      aria-hidden
                      className="mt-px size-3.5 shrink-0 text-amber-400"
                      strokeWidth={2}
                    />
                    <span>
                      Agents without -y may run in interactive mode and block spawning.{" "}
                      <button
                        type="button"
                        className={textLinkClassName}
                        disabled={formControlsDisabled}
                        onClick={() => {
                          setValue("args", insertNpxYesFlag(argsValue), {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                          if (updateMutation.isError) {
                            updateMutation.reset()
                          }
                        }}
                      >
                        Add -y
                      </button>
                    </span>
                  </p>
                ) : null}
                <div className="mt-2.5 min-w-0">
                  <p className="m-0 mb-1 text-2xs font-medium tracking-wide text-label">Command</p>
                  <pre
                    aria-label={`${agent.displayName} command preview`}
                    className="m-0 overflow-x-auto whitespace-pre-wrap break-all font-mono text-2xs text-dim"
                  >
                    {commandPreview === "" ? "—" : commandPreview}
                  </pre>
                </div>
              </div>

              {isDirty ? (
                <div className="flex items-center gap-2.5">
                  <Button
                    type="button"
                    variant="submit"
                    size="sm"
                    disabled={saveDisabled}
                    aria-label={`Save ${agent.displayName} launch settings`}
                    onClick={handleSubmit(onSave)}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={formControlsDisabled}
                    aria-label={`Reset ${agent.displayName} launch settings`}
                    onClick={handleReset}
                  >
                    Reset
                  </Button>
                </div>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}
