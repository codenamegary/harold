import { describe, expect, test } from "bun:test"
import {
  argsIncludeNpxYesFlag,
  insertNpxYesFlag,
  isNpxRunnerPath,
  needsNpxYesFlag,
} from "./npx.yes.flag"

describe("npx.yes.flag", () => {
  test("isNpxRunnerPath matches basename npx including windows wrappers", () => {
    expect(isNpxRunnerPath("npx")).toBe(true)
    expect(isNpxRunnerPath("/usr/bin/npx")).toBe(true)
    expect(isNpxRunnerPath("C:\\Program Files\\nodejs\\npx.cmd")).toBe(true)
    expect(isNpxRunnerPath("npx.exe")).toBe(true)
    expect(isNpxRunnerPath("agent")).toBe(false)
    expect(isNpxRunnerPath("/usr/bin/npm")).toBe(false)
  })

  test("argsIncludeNpxYesFlag accepts -y and --yes", () => {
    expect(argsIncludeNpxYesFlag(["-y", "pkg"])).toBe(true)
    expect(argsIncludeNpxYesFlag(["--yes", "pkg"])).toBe(true)
    expect(argsIncludeNpxYesFlag(["pkg", "-y"])).toBe(true)
    expect(argsIncludeNpxYesFlag(["pkg"])).toBe(false)
    expect(argsIncludeNpxYesFlag(["-yes"])).toBe(false)
  })

  test("needsNpxYesFlag only when path is npx and args omit yes", () => {
    expect(needsNpxYesFlag("npx", ["@scope/pkg@1.0.0"])).toBe(true)
    expect(needsNpxYesFlag("/usr/bin/npx", ["@scope/pkg@1.0.0"])).toBe(true)
    expect(needsNpxYesFlag("npx", ["-y", "@scope/pkg@1.0.0"])).toBe(false)
    expect(needsNpxYesFlag("agent", ["acp"])).toBe(false)
  })

  test("insertNpxYesFlag prepends -y when missing and is idempotent", () => {
    expect(insertNpxYesFlag(["@scope/pkg@1.0.0", "--acp"])).toEqual([
      "-y",
      "@scope/pkg@1.0.0",
      "--acp",
    ])
    expect(insertNpxYesFlag(["-y", "@scope/pkg@1.0.0"])).toEqual(["-y", "@scope/pkg@1.0.0"])
    expect(insertNpxYesFlag(["--yes", "@scope/pkg@1.0.0"])).toEqual([
      "--yes",
      "@scope/pkg@1.0.0",
    ])
  })
})
