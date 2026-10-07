import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { makeHaroldProgram } from "./harold.program"

const originalExitCode = process.exitCode

afterEach(() => {
  process.exitCode = originalExitCode
})

describe("makeHaroldProgram", () => {
  test("running harold with no command prints help and does not serve", async () => {
    let served = false
    const output: string[] = []
    const writeSpy = spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk))
      return true
    })

    try {
      process.exitCode = 0

      const program = makeHaroldProgram({
        serve: {
          runServer: async () => {
            served = true
          },
        },
      })

      await program.parseAsync([], { from: "user" })
    } finally {
      writeSpy.mockRestore()
    }

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
})
