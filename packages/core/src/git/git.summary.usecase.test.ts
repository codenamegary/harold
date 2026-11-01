import { describe, expect, test } from "bun:test"
import { GitCommandResult, RunGit } from "./git.ports"
import { makeGetGitSummary } from "./git.summary.usecase"
import { makeResolveRepository } from "./git.resolve.repository.usecase"

const ok = (stdout: string, exitCode = 0): GitCommandResult => ({
  ok: true,
  value: { exitCode, stdout, stderr: "", stdoutTruncated: false },
})

const stubGit =
  (handler: (args: ReadonlyArray<string>) => GitCommandResult): RunGit =>
  async (input) =>
    handler(input.args)

const repositoryStub = () =>
  makeResolveRepository({
    canonicalizePath: () => ({ ok: true, canonicalPath: "/repo" }),
    runGit: stubGit((args) => {
      if (args[0] === "rev-parse" && args[1] === "--show-toplevel") return ok("/repo\n")
      if (args[0] === "symbolic-ref" && args.includes("--short")) return ok("feat/x\n")
      if (args[0] === "symbolic-ref") return ok("", 1)
      if (args[0] === "rev-parse" && args[1] === "--verify") {
        return args.includes("refs/heads/main^{commit}") ? ok("main\n") : ok("", 1)
      }
      if (args[0] === "rev-parse") return ok("abc123\n")
      if (args[0] === "merge-base") return ok("base123\n")
      return ok("", 1)
    }),
  })

describe("get git summary", () => {
  test("resolves the repository and counts uncommitted entries", async () => {
    const getSummary = makeGetGitSummary({
      resolveRepository: repositoryStub(),
      runGit: stubGit((args) => {
        if (args[0] === "status") {
          return ok("1 .M N... 100644 100644 100644 abc def src/a.ts\0? notes.txt\0")
        }
        return ok("", 1)
      }),
    })

    const result = await getSummary({ path: "/repo" })

    expect(result).toEqual({
      ok: true,
      value: {
        repository: {
          root: "/repo",
          currentWorktreePath: "/repo",
          currentBranch: "feat/x",
          defaultBranch: "main",
          headSha: "abc123",
        },
        uncommittedFileCount: 2,
      },
    })
  })

  test("returns a path error before invoking git", async () => {
    const getSummary = makeGetGitSummary({
      resolveRepository: makeResolveRepository({
        canonicalizePath: () => ({ ok: false, error: { kind: "missing" } }),
        runGit: () => {
          throw new Error("runGit should not be called")
        },
      }),
      runGit: () => {
        throw new Error("runGit should not be called")
      },
    })

    expect(await getSummary({ path: "/missing" })).toEqual({
      ok: false,
      error: { kind: "path", error: { kind: "missing" } },
    })
  })

  test("maps a missing git binary to git_unavailable", async () => {
    const getSummary = makeGetGitSummary({
      resolveRepository: makeResolveRepository({
        canonicalizePath: () => ({ ok: true, canonicalPath: "/repo" }),
        runGit: async () => ({
          ok: false,
          error: { kind: "unavailable", detail: "spawn git ENOENT" },
        }),
      }),
      runGit: async () => ({
        ok: false,
        error: { kind: "unavailable", detail: "spawn git ENOENT" },
      }),
    })

    expect(await getSummary({ path: "/repo" })).toEqual({
      ok: false,
      error: { kind: "git_unavailable" },
    })
  })
})
