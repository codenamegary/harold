import { AgentSettings } from "contracts/http/agent-settings"
import { AgentSettingsError } from "core/agent-settings/errors"

const yesNo = (value: boolean): string => (value ? "yes" : "no")

const dash = (value: string | null): string => value ?? "-"

type Column = {
  label: string
  value: (item: AgentSettings) => string
}

const listColumns = (): Column[] => [
  { label: "id", value: (item) => item.id },
  { label: "displayName", value: (item) => item.displayName },
  { label: "present", value: (item) => yesNo(item.present) },
  { label: "enabled", value: (item) => yesNo(item.enabled) },
  { label: "available", value: (item) => yesNo(item.available) },
  { label: "auth", value: (item) => item.authSummary.status },
]

const probeColumns = (): Column[] => [
  { label: "path", value: (item) => dash(item.path) },
  { label: "runtime", value: (item) => item.state.status },
]

const renderTable = (columns: readonly Column[], items: readonly AgentSettings[]): string => {
  const header = columns.map((column) => column.label)
  const rows = items.map((item) => columns.map((column) => column.value(item)))
  const widths = columns.map((column, index) =>
    Math.max(column.label.length, ...rows.map((row) => row[index]?.length ?? 0)),
  )

  const renderRow = (cells: readonly string[]): string =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] ?? cell.length))
      .join("  ")
      .trimEnd()

  return [renderRow(header), ...rows.map(renderRow)].join("\n")
}

export const renderAgentList = (params: {
  items: readonly AgentSettings[]
  probe: boolean
}): string => {
  const columns = params.probe ? [...listColumns(), ...probeColumns()] : listColumns()

  return renderTable(columns, params.items)
}

const probeFields = (item: AgentSettings): Array<[string, string]> => {
  const fields: Array<[string, string]> = [
    ["present", yesNo(item.present)],
    ["path", dash(item.path)],
    ["enabled", yesNo(item.enabled)],
    ["available", yesNo(item.available)],
    ["runtime", item.state.status],
    ["auth", item.authSummary.status],
  ]

  if (item.state.error !== null) {
    fields.push(["runtime error", item.state.error])
  }
  if (item.authSummary.error !== null) {
    fields.push(["auth error", item.authSummary.error])
  }
  if (item.authSummary.activeSessionId !== null) {
    fields.push(["auth session", item.authSummary.activeSessionId])
  }

  return fields
}

export const renderAgentProbe = (item: AgentSettings): string => {
  const fields = probeFields(item)
  const labelWidth = Math.max(...fields.map(([label]) => label.length))

  return [
    `${item.id} (${item.displayName})`,
    ...fields.map(([label, value]) => `  ${label.padEnd(labelWidth)}  ${value}`),
  ].join("\n")
}

export const renderAgentProbes = (items: readonly AgentSettings[]): string =>
  items.map(renderAgentProbe).join("\n\n")

export const renderAgentNotFound = (agentId: string): string => `Unknown agent id: ${agentId}`

export const renderAgentUpdateError = (error: AgentSettingsError): string => {
  switch (error.kind) {
    case "not_found":
      return "Unknown agent id."
    case "cannot_enable":
      return "Agent cannot be enabled in this release."
    case "cannot_rename":
      return "Only custom agents can be renamed."
    case "cannot_delete":
      return "Catalog agents cannot be deleted."
    case "id_conflict":
      return "Another agent already uses this id."
    case "path_not_found":
      return "Could not find an agent executable on PATH."
    case "path_auto_detect_failed":
      return "Could not detect the agent executable path automatically."
    case "path_invalid":
      return `Invalid agent executable path: ${error.path}`
    case "registry_fetch_failed":
      return "Could not fetch the live ACP registry."
  }
}
