import path from "node:path"
import { AgentSettings } from "contracts/http/agent-settings"
import { Workspace } from "contracts/http/workspace"
import { AgentSettingsResult } from "core/agent-settings/errors"
import { RegisterWorkspaceResult } from "core/workspace/register.usecase"
import { renderAgentProbe, renderAgentUpdateError } from "./agent.render"

export type SetupPromptOption = Readonly<{
  value: string
  label: string
  hint?: string
}>

export type SetupPrompts = Readonly<{
  intro: (message: string) => void
  outro: (message: string) => void
  note: (message: string, title?: string) => void
  info: (message: string) => void
  warn: (message: string) => void
  step: (message: string) => void
  multiselect: (options: {
    message: string
    options: readonly SetupPromptOption[]
    initialValues: readonly string[]
  }) => Promise<readonly string[] | symbol>
  text: (options: {
    message: string
    placeholder?: string
    defaultValue?: string
  }) => Promise<string | symbol>
  select: (options: {
    message: string
    options: readonly SetupPromptOption[]
    initialValue?: string
  }) => Promise<string | symbol>
  confirm: (options: { message: string; initialValue: boolean }) => Promise<boolean | symbol>
  isCancel: (value: unknown) => value is symbol
  cancel: (message: string) => void
}>

export type SetupColors = Readonly<{
  red: (text: string) => string
  yellow: (text: string) => string
}>

export type SetupRecipe = Readonly<{
  id: string
  label: string
  hint: string
  guide: () => void
}>

export type SetupOptions = Readonly<{
  agents: readonly string[] | undefined
  workspace: string | undefined
  advertisedUrl: string | undefined
  pair: boolean
}>

export type SetupWizardDeps = Readonly<{
  dataDir: string
  cwd: string
  interactive: boolean
  prompts: SetupPrompts
  colors: SetupColors
  writeLine: (line: string) => void
  agents: Readonly<{
    list: () => readonly AgentSettings[]
    enable: (agentId: string) => AgentSettingsResult<AgentSettings>
    disable: (agentId: string) => AgentSettingsResult<AgentSettings>
  }>
  workspaces: Readonly<{
    list: () => readonly Workspace[]
    register: (path: string) => Promise<RegisterWorkspaceResult>
  }>
  recipes: readonly SetupRecipe[]
  reachability: Readonly<{
    verifyAndPersist: (advertisedUrl: string) => Promise<boolean>
  }>
  isDaemonRunning: () => boolean
  pair: () => Promise<boolean>
}>

const renderWelcome = (deps: SetupWizardDeps): void => {
  deps.prompts.intro("Harold setup")
  deps.prompts.note(
    [
      `Data directory: ${deps.dataDir}`,
      "",
      "This walks through the agents Harold can run, a workspace for them,",
      "how your phone reaches this machine, and pairing the phone.",
    ].join("\n"),
    "Welcome",
  )
}

const renderAuthPointer = (agent: AgentSettings): string | undefined => {
  if (agent.authSummary.status === "needs_auth") {
    return `${agent.displayName} needs provider sign-in on this host. Sign in with the agent's own CLI, or use Sign in in the Harold app after pairing.`
  }

  if (agent.authSummary.status === "error") {
    const detail = agent.authSummary.error === null ? "" : `: ${agent.authSummary.error}`
    return `${agent.displayName} reported an auth error${detail}. Check provider sign-in on this host.`
  }

  return undefined
}

const probeEnabledAgents = (deps: SetupWizardDeps): void => {
  const enabled = deps.agents.list().filter((agent) => agent.enabled)

  if (enabled.length === 0) {
    deps.prompts.warn(
      "No agents are enabled yet. Enable one later with `harold agent enable <id>`.",
    )
    return
  }

  deps.prompts.step("Probing enabled agents")
  for (const agent of enabled) {
    deps.writeLine(renderAgentProbe(agent))

    const pointer = renderAuthPointer(agent)
    if (pointer !== undefined) {
      deps.writeLine(deps.colors.yellow(pointer))
    }

    deps.writeLine("")
  }
}

const agentsStep = async (deps: SetupWizardDeps, options: SetupOptions): Promise<boolean> => {
  if (options.agents !== undefined) {
    const all = deps.agents.list()

    for (const agentId of options.agents) {
      if (!all.some((agent) => agent.id === agentId)) {
        deps.writeLine(deps.colors.red(`Unknown agent id: ${agentId}.`))
        return false
      }

      const result = deps.agents.enable(agentId)
      if (!result.ok) {
        deps.writeLine(deps.colors.red(renderAgentUpdateError(result.error)))
        return false
      }
    }
  } else if (!deps.interactive) {
    deps.prompts.info("Skipped agents: no --agents flag and stdin is not a terminal.")
  } else {
    const present = deps.agents.list().filter((agent) => agent.present)

    if (present.length === 0) {
      deps.prompts.warn(
        "No agents were detected on PATH. Install an agent CLI and run `harold setup` again.",
      )
      return true
    }

    const selected = await deps.prompts.multiselect({
      message: "Select the agents Harold can run",
      options: present.map((agent) => ({
        value: agent.id,
        label: agent.displayName,
        hint: agent.path ?? agent.authSummary.status,
      })),
      initialValues: present.filter((agent) => agent.enabled).map((agent) => agent.id),
    })

    if (deps.prompts.isCancel(selected)) {
      return false
    }

    const selectedIds = new Set(selected)
    for (const agent of present) {
      const shouldEnable = selectedIds.has(agent.id) && !agent.enabled
      const shouldDisable = !selectedIds.has(agent.id) && agent.enabled

      if (shouldEnable) {
        const result = deps.agents.enable(agent.id)
        if (!result.ok) {
          deps.writeLine(deps.colors.red(renderAgentUpdateError(result.error)))
        }
      }

      if (shouldDisable) {
        const result = deps.agents.disable(agent.id)
        if (!result.ok) {
          deps.writeLine(deps.colors.red(renderAgentUpdateError(result.error)))
        }
      }
    }
  }

  probeEnabledAgents(deps)
  return true
}

const isRegisteredWorkspace = (deps: SetupWizardDeps, candidate: string): boolean =>
  deps.workspaces
    .list()
    .some(
      (workspace) =>
        workspace.path === candidate || workspace.path === path.resolve(deps.cwd, candidate),
    )

const registerWorkspace = async (
  deps: SetupWizardDeps,
  workspacePath: string,
): Promise<boolean> => {
  const result = await deps.workspaces.register(workspacePath)
  if (!result.ok) {
    deps.writeLine(deps.colors.red(`Could not register ${workspacePath}.`))
    return false
  }

  deps.prompts.info(`Registered workspace ${result.value.name} (${result.value.path}).`)
  return true
}

const workspaceStep = async (deps: SetupWizardDeps, options: SetupOptions): Promise<boolean> => {
  if (options.workspace !== undefined) {
    if (isRegisteredWorkspace(deps, options.workspace)) {
      deps.prompts.info(`${options.workspace} is already a registered workspace.`)
      return true
    }

    return await registerWorkspace(deps, options.workspace)
  }

  if (!deps.interactive) {
    deps.prompts.info("Skipped workspace: no --workspace flag and stdin is not a terminal.")
    return true
  }

  const existing = deps.workspaces.list()
  if (existing.length > 0) {
    deps.prompts.note(
      existing.map((workspace) => `${workspace.name}  ${workspace.path}`).join("\n"),
      "Registered workspaces",
    )

    const another = await deps.prompts.confirm({
      message: "Register another workspace?",
      initialValue: false,
    })
    if (deps.prompts.isCancel(another)) {
      return false
    }
    if (!another) {
      deps.prompts.info("Skipped workspace.")
      return true
    }
  }

  const entered = await deps.prompts.text({
    message: "Workspace directory for your agents",
    placeholder: deps.cwd,
    defaultValue: deps.cwd,
  })
  if (deps.prompts.isCancel(entered)) {
    return false
  }

  const workspacePath = entered.trim()
  if (workspacePath === "") {
    deps.prompts.info("Skipped workspace.")
    return true
  }

  if (isRegisteredWorkspace(deps, workspacePath)) {
    deps.prompts.info(`${workspacePath} is already a registered workspace.`)
    return true
  }

  if (!(await registerWorkspace(deps, workspacePath))) {
    deps.prompts.warn("Continuing without a workspace.")
  }

  return true
}

const reachabilityStep = async (deps: SetupWizardDeps, options: SetupOptions): Promise<boolean> => {
  if (options.advertisedUrl !== undefined) {
    const persisted = await deps.reachability.verifyAndPersist(options.advertisedUrl)
    if (!persisted) {
      deps.writeLine(deps.colors.red(`Could not verify or persist ${options.advertisedUrl}.`))
      return false
    }

    return true
  }

  if (!deps.interactive) {
    deps.prompts.info("Skipped reachability: no --advertised-url flag and stdin is not a terminal.")
    return true
  }

  const selected = await deps.prompts.select({
    message: "How will your phone reach Harold?",
    options: deps.recipes.map((recipe) => ({
      value: recipe.id,
      label: recipe.label,
      hint: recipe.hint,
    })),
  })
  if (deps.prompts.isCancel(selected)) {
    return false
  }

  deps.recipes.find((recipe) => recipe.id === selected)?.guide()

  for (;;) {
    const entered = await deps.prompts.text({
      message: "Advertised URL for your phone",
      placeholder: "https://harold.example.com",
    })
    if (deps.prompts.isCancel(entered)) {
      return false
    }

    const advertisedUrl = entered.trim()
    if (advertisedUrl === "") {
      deps.prompts.info(
        "Skipped reachability. Run `harold connect --advertised-url <url>` when it is ready.",
      )
      return true
    }

    const persisted = await deps.reachability.verifyAndPersist(advertisedUrl)
    if (persisted) {
      return true
    }

    const retry = await deps.prompts.confirm({
      message: "Try a different URL?",
      initialValue: true,
    })
    if (deps.prompts.isCancel(retry)) {
      return false
    }
    if (!retry) {
      deps.prompts.warn("Continuing without a reachable endpoint; pairing will use loopback.")
      return true
    }
  }
}

const pairStep = async (deps: SetupWizardDeps, options: SetupOptions): Promise<boolean> => {
  if (!options.pair) {
    deps.prompts.info("Skipped pairing. Run `harold pair` when you are ready.")
    return true
  }

  if (!deps.isDaemonRunning()) {
    deps.prompts.warn(
      "Harold is not running on this host. Start `harold serve`, then run `harold pair` to pair the phone.",
    )
    return true
  }

  if (deps.interactive) {
    const wantsToPair = await deps.prompts.confirm({
      message: "Pair a phone now?",
      initialValue: true,
    })
    if (deps.prompts.isCancel(wantsToPair)) {
      return false
    }
    if (!wantsToPair) {
      deps.prompts.info("Skipped pairing. Run `harold pair` when you are ready.")
      return true
    }
  }

  const paired = await deps.pair()
  if (!paired) {
    deps.writeLine(deps.colors.red("Pairing did not complete."))
    return false
  }

  return true
}

export const runSetupWizard = async (
  deps: SetupWizardDeps,
  options: SetupOptions,
): Promise<number> => {
  renderWelcome(deps)

  const steps: ReadonlyArray<() => Promise<boolean>> = [
    () => agentsStep(deps, options),
    () => workspaceStep(deps, options),
    () => reachabilityStep(deps, options),
    () => pairStep(deps, options),
  ]

  for (const step of steps) {
    const ok = await step()
    if (!ok) {
      deps.prompts.cancel("Setup stopped.")
      return 1
    }
  }

  deps.prompts.outro("Harold is set up. Run `harold serve` if it is not already running.")
  return 0
}
