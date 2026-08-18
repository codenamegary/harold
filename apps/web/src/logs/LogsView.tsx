import React, { useState } from "react"
import { LogSource, logSources, LogSourceSchema } from "contracts/http/logs"
import { LogLevel, logLevels, LogLevelSchema } from "contracts/http/runtime-settings"
import { Button } from "../design-system/Button"
import { Panel } from "../design-system/Panel"
import { formatLogTime } from "./format.log.time"
import { useClearLogsMutation } from "./use.clear.logs.mutation"
import { useLogsQuery } from "./use.logs.query"

const logLevelLabel = (level: string) => level.charAt(0).toUpperCase() + level.slice(1)

const logLevelClassByLevel: Record<LogLevel, string> = {
  fatal: "text-danger",
  error: "text-danger",
  warn: "text-muted",
  info: "text-body-soft",
  debug: "text-dim",
  trace: "text-dim",
}

const sourceLabel = (source: LogSource, agentId: string | undefined): string =>
  agentId === undefined ? source : `${source}/${agentId}`

const selectWrapClassName =
  "block min-w-[9.5rem] rounded-md border border-line-input bg-surface-deep px-[11px] py-2"
const selectClassName =
  "block w-full appearance-none border-0 bg-transparent text-sm text-input outline-0"

export const LogsView: React.FC = () => {
  const [level, setLevel] = useState<LogLevel | undefined>(undefined)
  const [source, setSource] = useState<LogSource | undefined>(undefined)
  const logsQuery = useLogsQuery({ level, source })
  const clearLogsMutation = useClearLogsMutation()
  const lines = logsQuery.data?.items ?? []

  const handleLevelChange = (value: string) => {
    if (value === "") {
      setLevel(undefined)
      return
    }
    setLevel(LogLevelSchema.parse(value))
  }

  const handleSourceChange = (value: string) => {
    if (value === "") {
      setSource(undefined)
      return
    }
    setSource(LogSourceSchema.parse(value))
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 text-2xs text-label">
          <label htmlFor="log-source">Source</label>
          <span className={selectWrapClassName}>
            <select
              id="log-source"
              value={source ?? ""}
              onChange={(event) => {
                handleSourceChange(event.target.value)
              }}
              className={selectClassName}
            >
              <option value="">All sources</option>
              {logSources.map((item) => (
                <option key={item} value={item}>
                  {logLevelLabel(item)}
                </option>
              ))}
            </select>
          </span>
        </div>
        <div className="flex flex-col gap-1 text-2xs text-label">
          <label htmlFor="log-min-level">Minimum level</label>
          <span className={selectWrapClassName}>
            <select
              id="log-min-level"
              value={level ?? ""}
              onChange={(event) => {
                handleLevelChange(event.target.value)
              }}
              className={selectClassName}
            >
              <option value="">All levels</option>
              {logLevels.map((item) => (
                <option key={item} value={item}>
                  {logLevelLabel(item)}
                </option>
              ))}
            </select>
          </span>
        </div>
        <div className="ml-auto flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void logsQuery.refetch()
            }}
          >
            Refresh
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={clearLogsMutation.isPending}
            onClick={() => {
              clearLogsMutation.mutate()
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      {logsQuery.isError ? (
        <Panel className="p-8 text-sm text-danger" role="alert">
          Could not load logs.
        </Panel>
      ) : null}

      {clearLogsMutation.isError ? (
        <p className="m-0 text-sm text-danger" role="alert">
          Could not clear logs.
        </p>
      ) : null}

      {logsQuery.isLoading ? (
        <Panel className="p-8 text-sm text-dim">Loading logs…</Panel>
      ) : null}

      {!logsQuery.isLoading && !logsQuery.isError && lines.length === 0 ? (
        <Panel className="p-8 text-sm text-dim">No log lines in this process yet.</Panel>
      ) : null}

      {!logsQuery.isLoading && !logsQuery.isError && lines.length > 0 ? (
        <Panel className="min-h-0 flex-1 overflow-auto">
          <ul className="m-0 list-none p-0" role="log" aria-label="Process logs">
            {lines.map((line) => (
              <li
                key={line.id}
                className="grid grid-cols-[minmax(7rem,auto)_3.5rem_minmax(5rem,auto)_minmax(0,1fr)] gap-3 border-b border-line-soft px-[17px] py-2.5 font-mono text-xs last:border-b-0 max-[820px]:grid-cols-1"
              >
                <time className="text-dim" dateTime={line.ts}>
                  {formatLogTime(line.ts)}
                </time>
                <span className={logLevelClassByLevel[line.level]}>
                  {line.level.toUpperCase()}
                </span>
                <span className="text-muted">
                  {sourceLabel(line.source, line.agentId)}
                </span>
                <span className="min-w-0 whitespace-pre-wrap break-words text-body">
                  {line.message}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  )
}
