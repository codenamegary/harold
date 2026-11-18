import { describe, expect, test } from "bun:test"
import { createVfsStore } from "./vfs.store"
import { createVirtualGit } from "./git.virtual"
import { CAT_WORKTREE_ROOT, seedVfsAndRepos } from "./seed.data"
import { routeExecCommand, isHostScriptCommand } from "./exec.router"
import { createDemoHostStore } from "./host.store"

const setup = (seedWarningRun = false) => {
  const vfs = createVfsStore({ home: "/home/demo" })
  const repos = seedVfsAndRepos(vfs)
  const git = createVirtualGit(vfs, repos)
  const host = createDemoHostStore({ seedWarningRun })
  return { deps: { vfs, git, host }, vfs, git, host }
}

const quote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`

const hostCommand = (mode: string, ...args: Array<string>): string => {
  const script = `#!/bin/sh\n${"# host script body\n".repeat(800)}`
  return `export HAROLD_AGENT_SCRIPT=${quote(script)}; exec sh -c ${quote(
    'eval "$HAROLD_AGENT_SCRIPT"',
  )} harold-agent ${mode}${args.length > 0 ? ` ${args.map(quote).join(" ")}` : ""}`
}

describe("exec.router", () => {
  test("handles test -x and bash -lc presence/stale probes", () => {
    const { deps } = setup()

    const execOk = routeExecCommand("test -x '/usr/local/bin/opencode'", deps)
    expect(execOk).toEqual({ kind: "result", exitCode: 0, stdout: "", stderr: "" })

    const execMissing = routeExecCommand("test -x '/usr/local/bin/nonexistent'", deps)
    expect(execMissing).toEqual({ kind: "result", exitCode: 1, stdout: "", stderr: "" })

    const probeCmd =
      "exec bash -lc 'for pair in '\\''opencode:opencode'\\'' '\\''claude-acp:claude'\\''; do id=${pair%%:*}; c=${pair#*:}; p=$(command -v \"$c\" 2>/dev/null || true); if [ -n \"$p\" ]; then printf \"%s\\t%s\\n\" \"$id\" \"$p\"; fi; done'"
    const probeRes = routeExecCommand(probeCmd, deps)
    expect(probeRes.kind).toBe("result")
    if (probeRes.kind === "result") {
      expect(probeRes.exitCode).toBe(0)
      expect(probeRes.stdout).toContain("opencode\t/usr/local/bin/opencode")
      expect(probeRes.stdout).toContain("claude-acp\t/usr/local/bin/claude")
    }
  })

  test("handles cd <path> && git commands", () => {
    const { deps } = setup()

    const cmd = `cd '${CAT_WORKTREE_ROOT}' && git 'rev-parse' '--abbrev-ref' 'HEAD'`
    const res = routeExecCommand(cmd, deps)
    expect(res).toEqual({
      kind: "result",
      exitCode: 0,
      stdout: "feat/cat-mode\n",
      stderr: "",
    })
  })

  test("detects ACP agent launch commands", () => {
    const { deps } = setup()

    const direct = routeExecCommand("exec '/usr/local/bin/opencode' 'acp'", deps)
    expect(direct).toEqual({ kind: "acp", agentId: "opencode" })

    const wrapped = routeExecCommand(
      "exec bash -lc 'export PATH=/tmp:\"$PATH\"; exec '\''/usr/local/bin/claude'\'' '\''acp'\'''",
      deps,
    )
    expect(wrapped).toEqual({ kind: "acp", agentId: "claude-acp" })
  })

  test("recognizes the inlined host script without parsing its body", () => {
    const { deps } = setup()
    const command = hostCommand("connect", "opencode", "exec opencode acp", "-1")

    expect(isHostScriptCommand(command)).toBe(true)
    expect(routeExecCommand(command, deps)).toMatchObject({
      kind: "host-connect",
      agentId: "opencode",
      run: { created: true },
    })
  })

  test("host logs and cleanup use the in-memory run counters", () => {
    const { deps } = setup(true)

    const connected = routeExecCommand(hostCommand("connect", "opencode"), deps)
    expect(connected.kind).toBe("host-connect")

    const logs = routeExecCommand(hostCommand("logs"), deps)
    expect(logs.kind).toBe("result")
    if (logs.kind === "result") {
      expect(logs.stdout).toContain("run\topencode\t")
      expect(logs.stdout).toContain("\t1\t1\n")
      expect(logs.stdout).toContain("\t629145600\t")
    }

    const cleanup = routeExecCommand(hostCommand("cleanup", "all-inactive"), deps)
    expect(cleanup.kind).toBe("result")
    if (cleanup.kind === "result") {
      expect(cleanup.exitCode).toBe(0)
      expect(cleanup.stdout).toMatch(/^cleanup\t\d+\t\d+\n$/)
      expect(cleanup.stdout).not.toContain("cleanup\t0\t0")
    }
  })

  test("host stop marks the host stopped and rejects unknown policies", () => {
    const { deps } = setup()
    routeExecCommand(hostCommand("connect", "cursor"), deps)

    const stop = routeExecCommand(hostCommand("stop", "cursor"), deps)
    expect(stop).toEqual({ kind: "result", exitCode: 0, stdout: "", stderr: "" })

    const logs = routeExecCommand(hostCommand("logs"), deps)
    if (logs.kind === "result") {
      expect(logs.stdout).toContain("run\tcursor\t")
      expect(logs.stdout).toContain("\t1\t0\n")
    }

    const bad = routeExecCommand(hostCommand("cleanup", "everything"), deps)
    expect(bad).toMatchObject({ kind: "result", exitCode: 2 })
  })

  test("host usage returns seeded records for one agent", () => {
    const { deps } = setup()

    const usage = routeExecCommand(hostCommand("usage", "opencode"), deps)
    expect(usage.kind).toBe("result")
    if (usage.kind === "result") {
      expect(usage.exitCode).toBe(0)
      expect(usage.stdout).toContain("usage\topencode\t")
      expect(usage.stdout).toContain("ses_demo_opencode_0001")
      expect(usage.stdout).toContain("done\topencode")
    }

    const bad = routeExecCommand(hostCommand("usage", "not-an-agent"), deps)
    expect(bad).toMatchObject({ kind: "result", exitCode: 127 })
  })

  test("rejects unknown host modes and agents without touching the VFS", () => {
    const { deps } = setup()

    expect(routeExecCommand(hostCommand("connect", "not-an-agent"), deps)).toMatchObject({
      kind: "result",
      exitCode: 127,
    })
    expect(routeExecCommand(hostCommand("surprise"), deps)).toMatchObject({
      kind: "result",
      exitCode: 2,
    })
  })
})
