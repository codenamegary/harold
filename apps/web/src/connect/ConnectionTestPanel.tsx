import React, { useEffect, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"
import { ConnectionCheckId, ConnectionTestResponse } from "contracts/http/connection-test"
import { StatusDot } from "../design-system/StatusDot"
import { useRunConnectionTestMutation } from "../connection-test/use.run.connection.test.mutation"

const connectionCheckTitles: Record<ConnectionCheckId, string> = {
  dns: "DNS & reachability",
  tls: "TLS certificate",
  "device-auth": "Device authentication",
}

const connectionCheckOrder: ConnectionCheckId[] = ["dns", "tls", "device-auth"]

const statusLabelForCheck = (
  status: ConnectionTestResponse["checks"][number]["status"] | undefined,
  isRunning: boolean,
): string => {
  if (isRunning) {
    return "Running"
  }

  switch (status) {
    case "pass":
      return "Passed"
    case "warn":
      return "Warning"
    case "fail":
      return "Failed"
    default:
      return "Pending"
  }
}

const statusDotForSummary = (
  result: ConnectionTestResponse | undefined,
  isRunning: boolean,
): React.ComponentProps<typeof StatusDot>["variant"] => {
  // Prefer the last finished result so a stuck/in-flight re-run does not keep
  // the summary yellow after all checks already passed.
  if (result?.canContinue === true) {
    return "online"
  }

  if (result?.canContinueAnyway === true) {
    return "warning"
  }

  if (isRunning) {
    return "warning"
  }

  return "offline"
}

export type ConnectionTestPanelState = {
  result: ConnectionTestResponse | null
  isRunning: boolean
  canContinue: boolean
  canContinueAnyway: boolean
}

type ConnectionTestPanelProps = {
  advertisedUrl: string
  onStateChange?: (state: ConnectionTestPanelState) => void
}

export const ConnectionTestPanel: React.FC<ConnectionTestPanelProps> = ({
  advertisedUrl,
  onStateChange,
}) => {
  const { mutateAsync } = useRunConnectionTestMutation()
  const [result, setResult] = useState<ConnectionTestResponse | null>(null)
  const [runError, setRunError] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const autoRunStarted = useRef(false)
  const onStateChangeRef = useRef(onStateChange)
  onStateChangeRef.current = onStateChange

  const runTest = () => {
    if (isRunning) {
      return
    }

    setRunError(null)
    setResult(null)
    setIsRunning(true)
    void mutateAsync().then(
      (response) => {
        setResult(response)
        setIsRunning(false)
      },
      () => {
        setRunError("Connection test failed. Check the advertised URL and try again.")
        setIsRunning(false)
      },
    )
  }

  useEffect(() => {
    if (autoRunStarted.current) {
      return
    }

    autoRunStarted.current = true
    setRunError(null)
    setResult(null)
    setIsRunning(true)
    void mutateAsync().then(
      (response) => {
        setResult(response)
        setIsRunning(false)
      },
      () => {
        setRunError("Connection test failed. Check the advertised URL and try again.")
        setIsRunning(false)
      },
    )
  }, [mutateAsync])

  const canContinue = result?.canContinue === true
  const canContinueAnyway = result?.canContinueAnyway === true

  useEffect(() => {
    onStateChangeRef.current?.({
      result,
      isRunning,
      canContinue,
      canContinueAnyway,
    })
  }, [result, isRunning, canContinue, canContinueAnyway])

  const checksById = new Map(result?.checks.map((check) => [check.id, check]) ?? [])

  return (
    <div>
      <div className="flex items-center gap-2.5 rounded-lg border border-line-soft bg-panel-2 px-3.5 py-3">
        <StatusDot variant={statusDotForSummary(result ?? undefined, isRunning)} />
        <code className="min-w-0 flex-1 truncate font-mono text-base text-body">
          {advertisedUrl}
        </code>
        <span className="text-xs text-dim max-[640px]:hidden">External endpoint</span>
        <button
          type="button"
          aria-label={isRunning ? "Refreshing connection test" : "Refresh connection test"}
          disabled={isRunning}
          onClick={runTest}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-line-strong bg-panel-2 text-body cursor-pointer hover:bg-panel-elevated hover:border-line-hover-strong hover:text-white disabled:cursor-not-allowed"
        >
          <RefreshCw
            aria-hidden
            size={20}
            absoluteStrokeWidth
            strokeWidth={2}
            className={isRunning ? "animate-spin" : undefined}
          />
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {connectionCheckOrder.map((checkId) => {
          const check = checksById.get(checkId)
          const title = connectionCheckTitles[checkId]

          return (
            <div
              key={checkId}
              className="flex items-center gap-3 rounded-lg border border-line-soft bg-surface-deep px-3.5 py-3"
            >
              <StatusDot
                variant={
                  isRunning && check === undefined
                    ? "warning"
                    : check?.status === "pass"
                      ? "online"
                      : check?.status === "warn"
                        ? "warning"
                        : check?.status === "fail"
                          ? "offline"
                          : "warning"
                }
              />
              <div className="flex-1">
                <strong className="block text-base font-medium text-body">{title}</strong>
                <small className="mt-1 block text-base text-dim">
                  {isRunning && check === undefined
                    ? "Checking…"
                    : (check?.message ?? "Waiting to run…")}
                </small>
              </div>
              <em className="text-xs text-dim not-italic">
                {statusLabelForCheck(check?.status, isRunning && check === undefined)}
              </em>
            </div>
          )
        })}
      </div>

      {runError !== null ? (
        <p className="mt-4 text-base text-danger" role="alert">
          {runError}
        </p>
      ) : null}
    </div>
  )
}
