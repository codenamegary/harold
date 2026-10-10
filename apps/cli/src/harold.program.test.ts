import { afterEach, describe, expect, test } from "bun:test"
import { makeHaroldProgram } from "./harold.program"

const originalExitCode = process.exitCode

afterEach(() => {
  process.exitCode = originalExitCode
})

describe("makeHaroldProgram", () => {
  test("running harold with no command prints help and does not serve", async () => {
    let served = false
    const output: string[] = []

    process.exitCode = 0

    const program = makeHaroldProgram({
      serve: {
        runServer: async () => {
          served = true
        },
      },
    })
    program.configureOutput({
      writeOut: (chunk) => {
        output.push(chunk)
      },
    })

    await program.parseAsync([], { from: "user" })

    expect(served).toBe(false)
    expect(output.join("")).toContain("Usage: harold")
    expect(process.exitCode ?? 0).toBe(0)
  })

  test("registers the setup command", () => {
    const program = makeHaroldProgram()

    expect(program.commands.map((command) => command.name())).toContain("setup")
  })

  test("registers the stop command", () => {
    const program = makeHaroldProgram()

    expect(program.commands.map((command) => command.name())).toContain("stop")
  })

  test("registers the start command", () => {
    const program = makeHaroldProgram()

    expect(program.commands.map((command) => command.name())).toContain("start")
  })

  test("lists start and hides the internal serve command in the help output", async () => {
    const output: string[] = []
    const program = makeHaroldProgram()
    program.configureOutput({
      writeOut: (chunk) => output.push(chunk),
    })

    await program.parseAsync([], { from: "user" })
    const help = output.join("")

    expect(help).toContain("start the Harold daemon in the background")
    expect(help).not.toMatch(/^\s+serve\b/m)
  })
})
