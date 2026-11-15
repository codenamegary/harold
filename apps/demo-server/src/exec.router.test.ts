import { describe, expect, test } from "bun:test"
import { createVfsStore } from "./vfs.store"
import { createVirtualGit } from "./git.virtual"
import { CAT_WORKTREE_ROOT, seedVfsAndRepos } from "./seed.data"
import { routeExecCommand } from "./exec.router"

const setup = () => {
  const vfs = createVfsStore({ home: "/home/demo" })
  const repos = seedVfsAndRepos(vfs)
  const git = createVirtualGit(vfs, repos)
  return { vfs, git }
}

describe("exec.router", () => {
  test("handles test -x and bash -lc presence/stale probes", () => {
    const { vfs, git } = setup()

    const execOk = routeExecCommand("test -x '/usr/local/bin/opencode'", { vfs, git })
    expect(execOk).toEqual({ kind: "result", exitCode: 0, stdout: "", stderr: "" })

    const execMissing = routeExecCommand("test -x '/usr/local/bin/nonexistent'", { vfs, git })
    expect(execMissing).toEqual({ kind: "result", exitCode: 1, stdout: "", stderr: "" })

    const probeCmd =
      "exec bash -lc 'for pair in '\\''opencode:opencode'\\'' '\\''claude-acp:claude'\\''; do id=${pair%%:*}; c=${pair#*:}; p=$(command -v \"$c\" 2>/dev/null || true); if [ -n \"$p\" ]; then printf \"%s\\t%s\\n\" \"$id\" \"$p\"; fi; done'"
    const probeRes = routeExecCommand(probeCmd, { vfs, git })
    expect(probeRes.kind).toBe("result")
    if (probeRes.kind === "result") {
      expect(probeRes.exitCode).toBe(0)
      expect(probeRes.stdout).toContain("opencode\t/usr/local/bin/opencode")
      expect(probeRes.stdout).toContain("claude-acp\t/usr/local/bin/claude")
    }
  })

  test("handles cd <path> && git commands", () => {
    const { vfs, git } = setup()

    const cmd = `cd '${CAT_WORKTREE_ROOT}' && git 'rev-parse' '--abbrev-ref' 'HEAD'`
    const res = routeExecCommand(cmd, { vfs, git })
    expect(res).toEqual({
      kind: "result",
      exitCode: 0,
      stdout: "feat/cat-mode\n",
      stderr: "",
    })
  })

  test("detects ACP agent launch commands", () => {
    const { vfs, git } = setup()

    const direct = routeExecCommand("exec '/usr/local/bin/opencode' 'acp'", { vfs, git })
    expect(direct).toEqual({ kind: "acp", agentId: "opencode" })

    const wrapped = routeExecCommand(
      "exec bash -lc 'export PATH=/tmp:\"$PATH\"; exec '\''/usr/local/bin/claude'\'' '\''acp'\'''",
      { vfs, git },
    )
    expect(wrapped).toEqual({ kind: "acp", agentId: "claude-acp" })
  })
})
