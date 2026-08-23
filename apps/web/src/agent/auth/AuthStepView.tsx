import React from "react"
import { AuthStep } from "contracts/http/agent-auth"

type AuthStepViewProps = {
  step: AuthStep
  confirmDisabled: boolean
  confirming: boolean
  onConfirm: (stepId: string) => void
}

export const AuthStepView: React.FC<AuthStepViewProps> = ({
  step,
  confirmDisabled,
  confirming,
  onConfirm,
}) => {
  switch (step.type) {
    case "show_message":
      return (
        <p
          className={`m-0 whitespace-pre-wrap text-sm ${step.level === "error" ? "text-red-400" : "text-body"}`}
          role={step.level === "error" ? "alert" : undefined}
        >
          {step.body}
        </p>
      )
    case "confirm":
      return (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-sm font-semibold text-body">{step.title}</p>
          <p className="m-0 whitespace-pre-wrap text-sm text-body-soft">{step.body}</p>
          <button
            type="button"
            disabled={confirmDisabled || confirming}
            aria-busy={confirming ? "true" : undefined}
            className="w-fit rounded-md border border-[#4a4030] bg-[#221c14] px-3 py-1.5 text-sm text-body hover:bg-[#2b2419] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onConfirm(step.stepId)}
          >
            {confirming ? "Working…" : step.confirmLabel}
          </button>
        </div>
      )
    case "working":
      return (
        <p className="m-0 text-sm text-body-soft" role="status" aria-live="polite">
          {step.label}
        </p>
      )
    case "done":
      return (
        <p
          className={`m-0 text-sm ${step.outcome === "failed" ? "text-red-400" : "text-body-soft"}`}
          role="status"
        >
          {step.message ??
            (step.outcome === "succeeded"
              ? "Signed in"
              : step.outcome === "cancelled"
                ? "Cancelled"
                : "Sign-in failed")}
        </p>
      )
  }
}
