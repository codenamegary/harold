import { afterEach, describe, expect, test } from "bun:test"
import { makeHaroldProgram } from "./harold.program"

const originalExitCode = process.exitCode

afterEach(() => {
  process.exitCode = originalExitCode
})

describe("makeHaroldProgram", () => {
  test("running harold with no command serves the daemon", async () => {
    let served = false
    process.exitCode = undefined

    const program = makeHaroldProgram({
      serve: {
        readLiveDaemonState: () => ({ ok: false, error: { kind: "no_state_file" } }),
        isFreshInstall: () => false,
        runServer: async () => {
          served = true
        },
      },
    })

    await program.parseAsync([], { from: "user" })

    expect(served).toBe(true)
  })

  test("registers the setup command", () => {
    const program = makeHaroldProgram()

    expect(program.commands.map((command) => command.name())).toContain("setup")
  })
})
