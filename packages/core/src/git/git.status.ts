import { GitOperationError } from "./git.errors"
import { fromGitCommandFailure } from "./git.errors"
import { ParsedNumstat, ParsedStatusEntry } from "./git.parsers"
import { parseNumstat, parseStatusEntries } from "./git.parsers"
import { RunGit } from "./git.ports"

const READ_TIMEOUT_MS = 10_000
const STATUS_MAX_BYTES = 4 * 1024 * 1024

export type ReadStatusResult =
  | { ok: true; entries: ParsedStatusEntry[]; truncated: boolean }
  | { ok: false; error: GitOperationError }

export const readStatusEntries = async (
  runGit: RunGit,
  worktreePath: string,
): Promise<ReadStatusResult> => {
  const result = await runGit({
    cwd: worktreePath,
    args: ["status", "--porcelain=v2", "-z", "--untracked-files=all"],
    allowExitCodes: [0],
    timeoutMs: READ_TIMEOUT_MS,
    maxStdoutBytes: STATUS_MAX_BYTES,
  })
  if (!result.ok) {
    return { ok: false, error: fromGitCommandFailure(result.error) }
  }
  if (result.value.exitCode !== 0) {
    return {
      ok: false,
      error: {
        kind: "git_failed",
        detail: result.value.stderr.trim() || "git status failed",
      },
    }
  }
  return {
    ok: true,
    entries: parseStatusEntries(result.value.stdout),
    truncated: result.value.stdoutTruncated,
  }
}

export type ReadNumstatResult =
  | { ok: true; entries: ParsedNumstat[]; truncated: boolean }
  | { ok: false; error: GitOperationError }

export const readUncommittedNumstat = async (
  runGit: RunGit,
  root: string,
): Promise<ReadNumstatResult> => {
  const result = await runGit({
    cwd: root,
    args: ["diff", "HEAD", "--numstat", "-z", "--find-renames"],
    allowExitCodes: [0],
    timeoutMs: READ_TIMEOUT_MS,
    maxStdoutBytes: STATUS_MAX_BYTES,
  })
  if (!result.ok) {
    return { ok: false, error: fromGitCommandFailure(result.error) }
  }
  if (result.value.exitCode !== 0) {
    return {
      ok: false,
      error: {
        kind: "git_failed",
        detail: result.value.stderr.trim() || "git diff --numstat failed",
      },
    }
  }
  return {
    ok: true,
    entries: parseNumstat(result.value.stdout),
    truncated: result.value.stdoutTruncated,
  }
}
