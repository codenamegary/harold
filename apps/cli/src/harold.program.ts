import { Command } from "commander"
import packageJson from "../package.json"
import { makeAgentCommand } from "./agent.command"
import { makeConnectCommand } from "./connect.command"
import { makeDeviceCommand } from "./device.command"
import { makeLogsCommand } from "./logs.command"
import { makePairCommand } from "./pair.command"
import { ServeDeps, makeServeCommand } from "./serve.command"
import { makeSetupCommand } from "./setup.command"
import { StartDeps, makeStartCommand } from "./start.command"
import { makeStatusCommand } from "./status.command"
import { makeStopCommand } from "./stop.command"
import { makeWorkspaceCommand } from "./workspace.command"

export type HaroldProgramDeps = Readonly<{
  serve?: Partial<ServeDeps>
  start?: Partial<StartDeps>
}>

export const makeHaroldProgram = (deps: HaroldProgramDeps = {}): Command => {
  const program = new Command()

  program
    .name("harold")
    .description("Hark! The Harold Agents Sing - Access your agents on Android from anywhere.")
    .version(packageJson.version)
  program.addCommand(makeStartCommand(deps.start))
  // serve is the internal foreground command: start and setup spawn it
  // detached as the daemon, so it stays out of the operator help.
  program.addCommand(makeServeCommand(deps.serve), { hidden: true })
  program.addCommand(makeSetupCommand())
  program.addCommand(makeStatusCommand())
  program.addCommand(makeStopCommand())
  program.addCommand(makeAgentCommand())
  program.addCommand(makePairCommand())
  program.addCommand(makeDeviceCommand())
  program.addCommand(makeWorkspaceCommand())
  program.addCommand(makeLogsCommand())
  program.addCommand(makeConnectCommand())

  program.action(() => {
    program.outputHelp()
  })

  return program
}
