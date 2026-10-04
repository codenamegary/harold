import { Command } from "commander"
import pc from "picocolors"
import { AgentSettings } from "contracts/http/agent-settings"
import { probePresence } from "core/agent-catalog/probe.presence"
import { PresenceProbeContext } from "core/agent-catalog/profile.override"
import { AgentSettingsResult } from "core/agent-settings/errors"
import { makeListAgentSettings, ListAgentSettings } from "core/agent-settings/list.usecase"
import { AgentSettingsRow, FindAgentSettingsRow } from "core/agent-settings/ports"
import { makeAgentSettingsView } from "core/agent-settings/view"
import { makeUpdateAgentSettings, UpdateAgentSettings } from "core/agent-settings/update.usecase"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import {
  validateExecutablePath,
  ValidateExecutablePathFn,
} from "core/agent-settings/validate-agent-path"
import { parseConfig } from "server/config"
import { openDatabase } from "server/database"
import { ensureCatalogAgentSettingsRows } from "server/agent-settings/catalog.sqlite.adapters"
import {
  makeFindAgentSettingsRow,
  makeListAgentSettingsRows,
  makeUpdateAgentSettingsRow,
} from "server/agent-settings/sqlite-adapters"
import {
  renderAgentList,
  renderAgentNotFound,
  renderAgentProbe,
  renderAgentProbes,
  renderAgentUpdateError,
} from "./agent.render"

export type AgentCliDeps = Readonly<{
  dataDir: string
  whichFn?: WhichFn
  validateExecutablePathFn?: ValidateExecutablePathFn
  env?: Readonly<Record<string, string | undefined>>
}>

export type AgentCli = Readonly<{
  list: ListAgentSettings
  update: UpdateAgentSettings
  findRow: FindAgentSettingsRow
  restoreRow: (row: AgentSettingsRow) => void
  ensureCatalogRows: () => void
  close: () => void
}>

export const openAgentCli = (deps: AgentCliDeps): AgentCli => {
  const database = openDatabase({ dataDir: deps.dataDir })
  const whichFn: WhichFn = deps.whichFn ?? ((name) => Bun.which(name))
  const validatePath = deps.validateExecutablePathFn ?? validateExecutablePath
  const env = deps.env ?? process.env

  const presenceCtx = (): PresenceProbeContext => ({ which: whichFn, env })
  const buildView = makeAgentSettingsView({
    probePresence: (agentId, spawn) => probePresence(agentId, presenceCtx(), spawn),
    validatePath,
  })

  const listRows = makeListAgentSettingsRows(database)
  const findRow = makeFindAgentSettingsRow(database)
  const updateRow = makeUpdateAgentSettingsRow(database)

  return {
    list: makeListAgentSettings({ listRows, buildView }),
    update: makeUpdateAgentSettings({
      listRows,
      findRow,
      updateRow,
      buildView,
      whichFn,
      validatePath,
    }),
    findRow,
    restoreRow: (row) =>
      updateRow({
        agentId: row.agentId,
        patch: {
          enabled: row.enabled,
          path: row.path,
          args: row.args,
          spawnSnapshot: row.spawnSnapshot,
          updatedAt: row.updatedAt,
        },
      }),
    ensureCatalogRows: () => ensureCatalogAgentSettingsRows(database),
    close: database.close,
  }
}

export const enableAgent = (cli: AgentCli, agentId: string): AgentSettingsResult<AgentSettings> => {
  cli.ensureCatalogRows()
  const prior = cli.findRow(agentId)
  const result = cli.update({ agentId, body: { enabled: true } })

  if (!result.ok && result.error.kind === "path_auto_detect_failed") {
    if (prior !== undefined) {
      cli.restoreRow(prior)
    } else {
      cli.update({ agentId, body: { enabled: false } })
    }
  }

  return result
}

export const disableAgent = (
  cli: AgentCli,
  agentId: string,
): AgentSettingsResult<AgentSettings> => {
  cli.ensureCatalogRows()
  return cli.update({ agentId, body: { enabled: false } })
}

export const makeAgentCommand = (): Command => {
  const command = new Command("agent")
  command.description("list, enable, disable, and probe agents")

  const list = new Command("list")
  list.description("list agents and their settings")
  list.option("--probe", "include presence path and runtime state")
  list.action((options: { probe?: boolean }) => {
    const config = parseConfig(process.env)
    const cli = openAgentCli({ dataDir: config.dataDir })

    try {
      console.log(renderAgentList({ items: cli.list(), probe: options.probe === true }))
    } finally {
      cli.close()
    }
  })

  const enable = new Command("enable <id>")
  enable.description("enable an agent")
  enable.action((id: string) => {
    const config = parseConfig(process.env)
    const cli = openAgentCli({ dataDir: config.dataDir })

    try {
      const result = enableAgent(cli, id)

      if (!result.ok) {
        console.log(pc.red(renderAgentUpdateError(result.error)))
        process.exitCode = 1
        return
      }

      console.log(pc.green(`Enabled ${result.value.displayName} (${result.value.id}).`))
    } finally {
      cli.close()
    }
  })

  const disable = new Command("disable <id>")
  disable.description("disable an agent")
  disable.action((id: string) => {
    const config = parseConfig(process.env)
    const cli = openAgentCli({ dataDir: config.dataDir })

    try {
      const result = disableAgent(cli, id)

      if (!result.ok) {
        console.log(pc.red(renderAgentUpdateError(result.error)))
        process.exitCode = 1
        return
      }

      console.log(pc.green(`Disabled ${result.value.displayName} (${result.value.id}).`))
    } finally {
      cli.close()
    }
  })

  const probe = new Command("probe [id]")
  probe.description("probe agent presence and state (default: enabled agents)")
  probe.action((id: string | undefined) => {
    const config = parseConfig(process.env)
    const cli = openAgentCli({ dataDir: config.dataDir })

    try {
      const items = cli.list()

      if (id !== undefined) {
        const item = items.find((candidate) => candidate.id === id)
        if (item === undefined) {
          console.log(pc.red(renderAgentNotFound(id)))
          process.exitCode = 1
          return
        }
        console.log(renderAgentProbe(item))
        return
      }

      const enabled = items.filter((candidate) => candidate.enabled)
      if (enabled.length === 0) {
        console.log(pc.dim("No enabled agents to probe."))
        return
      }
      console.log(renderAgentProbes(enabled))
    } finally {
      cli.close()
    }
  })

  command.addCommand(list)
  command.addCommand(enable)
  command.addCommand(disable)
  command.addCommand(probe)

  return command
}
