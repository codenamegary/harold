import React from "react"
import { AgentAuth, AgentAuthSummary } from "contracts/http/agent-auth"
import { AgentId } from "contracts/http/agent-settings"
import { AuthStepView } from "./AuthStepView"
import {
  useAgentAuthSessionActionMutation,
  useStartAgentAuthSessionMutation,
} from "./use.agent.auth"
import { isAgentAuthRequestError } from "./agent.auth"

type AgentAuthPanelProps = {
  agentId: AgentId
  agentName: string
  summary: AgentAuthSummary
  auth: AgentAuth | null
  compact?: boolean
}

export const AgentAuthPanel: React.FC<AgentAuthPanelProps> = ({
  agentId,
  agentName,
  summary,
  auth,
  compact = false,
}) => {
  const startMutation = useStartAgentAuthSessionMutation()
  const actionMutation = useAgentAuthSessionActionMutation()

  const session =
    auth !== null
      ? auth.session
      : startMutation.data?.status === "in_progress"
        ? startMutation.data
        : actionMutation.data?.status === "in_progress"
          ? actionMutation.data
          : null
  const sessionInFlight = session?.status === "in_progress"
  const errorMessage = isAgentAuthRequestError(startMutation.error)
    ? startMutation.error.detail
    : isAgentAuthRequestError(actionMutation.error)
      ? actionMutation.error.detail
      : startMutation.isError || actionMutation.isError
        ? "Auth request failed"
        : null

  const handleConfirm = (stepId: string) => {
    if (session === null) {
      return
    }
    actionMutation.mutate({
      agentId,
      sessionId: session.sessionId,
      action: { type: "confirm", stepId },
    })
  }

  const handleCancel = () => {
    if (session === null) {
      return
    }
    actionMutation.mutate({
      agentId,
      sessionId: session.sessionId,
      action: { type: "cancel" },
    })
  }

  if (summary.status === "authenticated" && !sessionInFlight) {
    return null
  }

  const shellClassName = compact
    ? "mb-3 rounded-[9px] border border-[#3a3220] bg-[#17130d] px-4 py-3"
    : "rounded-[9px] border border-line-soft bg-panel-elevated px-3 py-3"

  return (
    <div className={shellClassName} aria-label={`${agentName} auth`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="m-0 text-2xs font-medium tracking-wide text-label">Host login</p>
        {summary.error !== null && summary.error !== "" ? (
          <p className="m-0 text-2xs text-red-400" role="alert">
            {summary.error}
          </p>
        ) : null}
      </div>

      {sessionInFlight && session !== null ? (
        <div className="flex flex-col gap-3">
          {session.steps.map((step, index) => (
            <AuthStepView
              key={`${session.sessionId}-${step.type}-${index}`}
              step={step}
              confirmDisabled={actionMutation.isPending}
              confirming={
                actionMutation.isPending &&
                actionMutation.variables?.action.type === "confirm"
              }
              onConfirm={handleConfirm}
            />
          ))}
          <button
            type="button"
            disabled={actionMutation.isPending}
            className="w-fit text-2xs font-semibold text-body-soft hover:text-lime disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleCancel}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={startMutation.isPending || sessionInFlight}
            className="rounded-md border border-[#4a4030] bg-[#221c14] px-3 py-1.5 text-sm text-body hover:bg-[#2b2419] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => startMutation.mutate(agentId)}
          >
            {startMutation.isPending ? "Starting…" : "Sign in"}
          </button>
        </div>
      )}

      {errorMessage !== null ? (
        <p className="m-0 mt-2 text-2xs text-red-400" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  )
}
