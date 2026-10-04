import { Command } from "commander"
import packageJson from "../package.json"
import { makeServeCommand } from "./serve.command"
import { makeStatusCommand } from "./status.command"

export const makeHaroldProgram = (): Command => {
  const program = new Command()

  program
    .name("harold")
    .description(
      "Hark! The Harold Agents Sing. Harold keeps the host: agents, workspace, and reachability.",
    )
    .version(packageJson.version)
  program.addCommand(makeServeCommand())
  program.addCommand(makeStatusCommand())

  return program
}
