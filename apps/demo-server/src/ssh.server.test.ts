import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { generateKeyPairSync } from "node:crypto"
import { Client, SFTPWrapper } from "ssh2"
import { DEMO_HOST_KEY } from "./host.key"
import { createDemoSshServer } from "./ssh.server"

const HOST_KEY = DEMO_HOST_KEY

const connectClient = (options: {
  port: number
  username: string
  password?: string
  privateKey?: string
}): Promise<Client> =>
  new Promise((resolve, reject) => {
    const client = new Client()
    client.on("ready", () => resolve(client))
    client.on("error", reject)
    client.connect({
      host: "127.0.0.1",
      port: options.port,
      username: options.username,
      password: options.password,
      privateKey: options.privateKey,
    })
  })

const execCommand = (client: Client, cmd: string): Promise<{ code: number; stdout: string }> =>
  new Promise((resolve, reject) => {
    client.exec(cmd, (err, stream) => {
      if (err) {
        reject(err)
        return
      }
      const chunks: Array<Buffer> = []
      const state = { code: 0 }
      stream.on("data", (data: Buffer) => chunks.push(data))
      stream.on("exit", (code: number | null) => {
        state.code = code ?? 0
      })
      stream.on("close", () => {
        resolve({ code: state.code, stdout: Buffer.concat(chunks).toString("utf8") })
      })
    })
  })

const openSftp = (client: Client): Promise<SFTPWrapper> =>
  new Promise((resolve, reject) => {
    client.sftp((err, wrapper) => (err ? reject(err) : resolve(wrapper)))
  })

const sftpReadFile = (sftp: SFTPWrapper, remotePath: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    sftp.readFile(remotePath, (err, data) => (err ? reject(err) : resolve(data)))
  })

const sftpWriteFile = (
  sftp: SFTPWrapper,
  remotePath: string,
  content: Buffer,
): Promise<void> =>
  new Promise((resolve, reject) => {
    sftp.writeFile(remotePath, content, (err) => (err ? reject(err) : resolve()))
  })

const sftpRename = (
  sftp: SFTPWrapper,
  oldPath: string,
  newPath: string,
): Promise<void> =>
  new Promise((resolve, reject) => {
    sftp.rename(oldPath, newPath, (err) => (err ? reject(err) : resolve()))
  })

const sftpRemove = (sftp: SFTPWrapper, remotePath: string): Promise<void> =>
  new Promise((resolve, reject) => {
    sftp.unlink(remotePath, (err) => (err ? reject(err) : resolve()))
  })

const sftpStat = (sftp: SFTPWrapper, remotePath: string): Promise<unknown> =>
  new Promise((resolve) => {
    sftp.stat(remotePath, (err, stats) => resolve(err ? null : stats))
  })

const sftpOpenDir = (sftp: SFTPWrapper, remotePath: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    sftp.opendir(remotePath, (err, handle) => (err ? reject(err) : resolve(handle)))
  })

const acpCall = (
  client: Client,
  method: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    client.exec("exec /usr/local/bin/opencode acp", (err, stream) => {
      if (err) {
        reject(err)
        return
      }
      const state = { buffer: "", initialized: false }
      stream.on("data", (chunk: Buffer) => {
        state.buffer += chunk.toString("utf8")
        const lines = state.buffer.split("\n")
        state.buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          const message = JSON.parse(line) as Record<string, unknown>
          if (!state.initialized && message.id === 1) {
            state.initialized = true
            stream.write(
              `${JSON.stringify({ jsonrpc: "2.0", id: 2, method, params })}\n`,
            )
          } else if (message.id === 2) {
            resolve(message)
            stream.end()
          }
        }
      })
      stream.write(
        `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })}\n`,
      )
    })
  })

const quote = (value: string): string => `'${value.replace(/'/g, "'\\''")}'`

const hostCommand = (mode: string, ...args: Array<string>): string => {
  const script = `#!/bin/sh\n${"# inlined host script body\n".repeat(800)}`
  return `export HAROLD_AGENT_SCRIPT=${quote(script)}; exec sh -c ${quote(
    'eval "$HAROLD_AGENT_SCRIPT"',
  )} harold-agent ${mode}${args.length > 0 ? ` ${args.map(quote).join(" ")}` : ""}`
}

type JsonLineReader = {
  next: () => Promise<Record<string, unknown>>
}

const jsonLineReader = (stream: { on: (event: string, cb: (chunk: Buffer) => void) => void }): JsonLineReader => {
  let buffer = ""
  const lines: Array<string> = []
  const waiters: Array<(line: string) => void> = []
  stream.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8")
    const parts = buffer.split("\n")
    buffer = parts.pop() ?? ""
    for (const line of parts) {
      if (!line.trim()) continue
      const waiter = waiters.shift()
      if (waiter) {
        waiter(line)
      } else {
        lines.push(line)
      }
    }
  })
  return {
    next: () =>
      new Promise((resolve, reject) => {
        const existing = lines.shift()
        if (existing !== undefined) {
          resolve(JSON.parse(existing) as Record<string, unknown>)
          return
        }
        const timer = setTimeout(
          () => reject(new Error("timed out waiting for an ACP line")),
          5_000,
        )
        waiters.push((line) => {
          clearTimeout(timer)
          resolve(JSON.parse(line) as Record<string, unknown>)
        })
      }),
  }
}

const hostConnect = (
  client: Client,
  agentId: string,
): Promise<{
  stream: { end: () => void; write: (data: string) => void }
  reader: JsonLineReader
  init: Record<string, unknown>
}> =>
  new Promise((resolve, reject) => {
    client.exec(hostCommand("connect", agentId), (err, stream) => {
      if (err) {
        reject(err)
        return
      }
      const reader = jsonLineReader(stream)
      reader
        .next()
        .then((init) => resolve({ stream, reader, init }))
        .catch(reject)
    })
  })

const logRows = (stdout: string): Array<Array<string>> =>
  stdout
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"))

const activeRows = (stdout: string, agentId: string): Array<Array<string>> =>
  logRows(stdout).filter((row) => row[1] === agentId && row[5] === "1")

describe("ssh.server", () => {
  const serverHandle = createDemoSshServer({
    host: "127.0.0.1",
    port: 0,
    hostKey: HOST_KEY,
    timing: { charDelayMs: 0, toolDelayMs: 0 },
  })
  const portState = { port: 0 }

  beforeAll(async () => {
    portState.port = await serverHandle.listen()
  })

  afterAll(async () => {
    await serverHandle.close()
  })

  test("accepts any username with any password or any public key", async () => {
    const pwClient = await connectClient({
      port: portState.port,
      username: "anyone",
      password: "any-password",
    })
    const res = await execCommand(pwClient, "pwd")
    expect(res.stdout.trim()).toBe("/home/demo")
    pwClient.end()

    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "pkcs1", format: "pem" },
    })
    const keyClient = await connectClient({
      port: portState.port,
      username: "tester-key",
      privateKey,
    })
    const keyRes = await execCommand(keyClient, "uname")
    expect(keyRes.stdout.trim()).toBe("Linux")
    keyClient.end()
  })

  test("serves SFTP reads and acknowledges writes without changing the seed", async () => {
    const client = await connectClient({
      port: portState.port,
      username: "sftp-tester",
      password: "pw",
    })

    const sftp = await openSftp(client)

    const realHome = await new Promise<string>((resolve, reject) => {
      sftp.realpath(".", (err, abs) => (err ? reject(err) : resolve(abs)))
    })
    expect(realHome).toBe("/home/demo")

    const workspacesRaw = await sftpReadFile(sftp, "/home/demo/.harold/workspaces.json")
    expect(workspacesRaw.toString("utf8")).toContain("cat-screensaver")

    // A path outside the virtual home never reaches the container filesystem.
    const outsideExists = await new Promise<boolean>((resolve) => {
      sftp.readFile("/etc/passwd", (err) => resolve(err === undefined || err === null))
    })
    expect(outsideExists).toBe(false)

    const agentsBefore = await sftpReadFile(sftp, "/home/demo/.harold/agents.json")
    expect(agentsBefore.toString("utf8")).toContain("opencode")

    await sftpWriteFile(sftp, "/home/demo/.harold/agents.json", Buffer.from("[]"))
    const afterDirectWrite = await sftpReadFile(sftp, "/home/demo/.harold/agents.json")
    expect(afterDirectWrite.toString("utf8")).toBe(agentsBefore.toString("utf8"))

    await sftpWriteFile(sftp, "/home/demo/.harold/agents.json.1.tmp", Buffer.from("[]"))
    expect(await sftpStat(sftp, "/home/demo/.harold/agents.json.1.tmp")).toBeNull()

    await sftpRename(
      sftp,
      "/home/demo/.harold/agents.json.1.tmp",
      "/home/demo/.harold/agents.json",
    )
    const afterRename = await sftpReadFile(sftp, "/home/demo/.harold/agents.json")
    expect(afterRename.toString("utf8")).toBe(agentsBefore.toString("utf8"))

    await sftpRemove(sftp, "/home/demo/.harold/agents.json")
    const afterRemove = await sftpReadFile(sftp, "/home/demo/.harold/agents.json")
    expect(afterRemove.toString("utf8")).toBe(agentsBefore.toString("utf8"))

    await sftpWriteFile(sftp, "/home/demo/.harold/upload.bin", Buffer.from("payload"))
    expect(await sftpStat(sftp, "/home/demo/.harold/upload.bin")).toBeNull()

    client.end()
  })

  test("runs ACP over SSH exec and isolates state per connection", async () => {
    const clientA = await connectClient({
      port: portState.port,
      username: "shared-name",
      password: "pw",
    })
    const clientB = await connectClient({
      port: portState.port,
      username: "shared-name",
      password: "pw",
    })

    // Run Turn 1 + Turn 2 on clientA
    await new Promise<void>((resolve, reject) => {
      clientA.exec("exec '/usr/local/bin/opencode' 'acp'", (err, stream) => {
        if (err) {
          reject(err)
          return
        }
        const state = { buffer: "", sessionId: "" }
        stream.on("data", (chunk: Buffer) => {
          state.buffer += chunk.toString("utf8")
          const lines = state.buffer.split("\n")
          state.buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.trim()) continue
            const msg = JSON.parse(line) as Record<string, unknown>
            if (msg.id === 1) {
              stream.write(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: 2,
                  method: "session/new",
                  params: { cwd: "/home/demo/sites/cat-screensaver-worktrees/cat-mode" },
                }) + "\n",
              )
            } else if (msg.id === 2) {
              state.sessionId = ((msg.result as Record<string, unknown>)?.sessionId as string) ?? ""
              stream.write(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: 3,
                  method: "session/prompt",
                  params: { sessionId: state.sessionId, prompt: [{ type: "text", text: "hi" }] },
                }) + "\n",
              )
            } else if (msg.method === "elicitation/create") {
              stream.write(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: msg.id,
                  result: { action: "accept", content: { mode: "settings-toggle" } },
                }) + "\n",
              )
            } else if (msg.id === 3) {
              stream.write(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: 4,
                  method: "session/prompt",
                  params: { sessionId: state.sessionId, prompt: [{ type: "text", text: "build" }] },
                }) + "\n",
              )
            } else if (msg.id === 4) {
              stream.end()
              resolve()
            }
          }
        })
        stream.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: { clientCapabilities: { elicitation: { form: {} } } },
          }) + "\n",
        )
      })
    })

    const statusA = await execCommand(
      clientA,
      "cd '/home/demo/sites/cat-screensaver-worktrees/cat-mode' && git status --porcelain=v1 -uall",
    )
    expect(statusA.stdout).toContain("?? src/cat-mode.js")

    const statusB = await execCommand(
      clientB,
      "cd '/home/demo/sites/cat-screensaver-worktrees/cat-mode' && git status --porcelain=v1 -uall",
    )
    expect(statusB.stdout).toBe("")

    clientA.end()
    clientB.end()
  })

  test("shares ACP sessions across SSH connections and keeps ids unique", async () => {
    const clientA = await connectClient({
      port: portState.port,
      username: "session-a",
      password: "pw",
    })
    const clientB = await connectClient({
      port: portState.port,
      username: "session-b",
      password: "pw",
    })

    const createdA = await acpCall(clientA, "session/new", {
      cwd: "/home/demo/sites/meow",
    })
    const sessionA = ((createdA.result as Record<string, unknown>)?.sessionId as string) ?? ""
    expect(sessionA).toMatch(/^ses_demo_opencode_\d{4}$/)

    const listB = await acpCall(clientB, "session/list", {})
    const sessionsB = ((listB.result as Record<string, unknown>)?.sessions ??
      []) as Array<{ sessionId: string }>
    expect(sessionsB.some((session) => session.sessionId === sessionA)).toBe(true)

    const loadB = await acpCall(clientB, "session/load", {
      sessionId: sessionA,
      cwd: "/home/demo/sites/meow",
    })
    expect(loadB.error).toBeUndefined()

    const createdB = await acpCall(clientB, "session/new", {
      cwd: "/home/demo/sites/meow",
    })
    const sessionB = ((createdB.result as Record<string, unknown>)?.sessionId as string) ?? ""
    expect(sessionB).not.toBe(sessionA)

    clientA.end()
    clientB.end()
  })
})

describe("ssh.server host lifecycle", () => {
  const serverHandle = createDemoSshServer({
    host: "127.0.0.1",
    port: 0,
    hostKey: HOST_KEY,
    seedWarningRun: true,
    timing: { charDelayMs: 0, toolDelayMs: 0 },
  })
  const portState = { port: 0 }

  beforeAll(async () => {
    portState.port = await serverHandle.listen()
  })

  afterAll(async () => {
    await serverHandle.close()
  })

  test("replays host initialize, reuses the live run, rotates on restart, and cleans inactive runs", async () => {
    const client = await connectClient({
      port: portState.port,
      username: "host-tester",
      password: "pw",
    })

    const first = await hostConnect(client, "opencode")
    expect(first.init.jsonrpc).toBe("2.0")
    expect(first.init.id).toBe("harold-host-init")
    expect((first.init.result as Record<string, unknown>).agentInfo).toBeDefined()

    const newSession = {
      jsonrpc: "2.0",
      id: 1,
      method: "session/new",
      params: { cwd: "/home/demo/sites/meow" },
    }
    first.stream.write(`${JSON.stringify(newSession)}\n`)
    const created = await first.reader.next()
    expect((created.result as Record<string, unknown>).sessionId).toMatch(
      /^ses_demo_opencode_\d{4}$/,
    )
    first.stream.end()

    const logs1 = await execCommand(client, hostCommand("logs"))
    const active1 = activeRows(logs1.stdout, "opencode")
    expect(active1).toHaveLength(1)
    expect(active1[0]?.[6]).toBe("1")
    expect(Number(active1[0]?.[3])).toBeGreaterThan(0)
    const firstRunId = active1[0]?.[2] ?? ""

    // A reconnect reuses the live run.
    const second = await hostConnect(client, "opencode")
    second.stream.end()
    const logs2 = await execCommand(client, hostCommand("logs"))
    const active2 = activeRows(logs2.stdout, "opencode")
    expect(active2).toHaveLength(1)
    expect(active2[0]?.[2]).toBe(firstRunId)

    // Stop keeps the run, and the next host start gets a new one.
    await execCommand(client, hostCommand("stop", "opencode"))
    const stopped = activeRows((await execCommand(client, hostCommand("logs"))).stdout, "opencode")
    expect(stopped[0]?.[6]).toBe("0")

    const third = await hostConnect(client, "opencode")
    third.stream.end()
    const logs3 = await execCommand(client, hostCommand("logs"))
    const active3 = activeRows(logs3.stdout, "opencode")
    expect(active3).toHaveLength(1)
    expect(active3[0]?.[2]).not.toBe(firstRunId)
    expect(logRows(logs3.stdout).some((row) => row[2] === firstRunId)).toBe(true)

    const cleanup = await execCommand(client, hostCommand("cleanup", "all-inactive"))
    expect(cleanup.stdout).toMatch(/^cleanup\t\d+\t\d+\n$/)
    const after = await execCommand(client, hostCommand("logs"))
    const stillActive = activeRows(after.stdout, "opencode")
    expect(stillActive).toHaveLength(1)
    expect(stillActive[0]?.[2]).toBe(active3[0]?.[2])
    expect(logRows(after.stdout).some((row) => row[2] === firstRunId)).toBe(false)
    expect(after.stdout).not.toContain("629145600")

    client.end()
  })

  test("rejects an oversized inlined host command", async () => {
    const client = await connectClient({
      port: portState.port,
      username: "host-limit-tester",
      password: "pw",
    })
    const script = `#!/bin/sh\n${"# too large\n".repeat(2_800)}`
    const command = `export HAROLD_AGENT_SCRIPT=${quote(script)}; exec sh -c ${quote(
      'eval "$HAROLD_AGENT_SCRIPT"',
    )} harold-agent logs`
    const result = await execCommand(client, command)
    expect(result.code).toBe(1)
    client.end()
  })
})

describe("ssh.server limits", () => {
  const serverHandle = createDemoSshServer({
    host: "127.0.0.1",
    port: 0,
    hostKey: HOST_KEY,
    timing: { charDelayMs: 0, toolDelayMs: 0 },
    limits: {
      maxConnections: 4,
      maxSessionsPerConnection: 4,
      maxSftpHandles: 2,
      maxExecLineBytes: 32,
      maxExecPendingLines: 2,
      maxCommandBytes: 64,
    },
  })
  const portState = { port: 0 }

  beforeAll(async () => {
    portState.port = await serverHandle.listen()
  })

  afterAll(async () => {
    await serverHandle.close()
  })

  test("reuses session slots after SFTP channels close", async () => {
    const client = await connectClient({
      port: portState.port,
      username: "session-tester",
      password: "pw",
    })

    for (let index = 0; index < 6; index += 1) {
      const sftp = await openSftp(client)
      sftp.end()
      await Bun.sleep(20)
    }

    client.end()
  })

  test("rejects SFTP handles over the limit", async () => {
    const client = await connectClient({
      port: portState.port,
      username: "handle-tester",
      password: "pw",
    })
    const sftp = await openSftp(client)

    await sftpOpenDir(sftp, "/home/demo")
    await sftpOpenDir(sftp, "/home/demo/sites")

    const state = { rejected: false }
    try {
      await sftpOpenDir(sftp, "/home/demo/.harold")
    } catch {
      state.rejected = true
    }
    expect(state.rejected).toBe(true)

    client.end()
  })

  test("rejects oversized exec commands", async () => {
    const client = await connectClient({
      port: portState.port,
      username: "command-tester",
      password: "pw",
    })

    const result = await execCommand(client, `echo ${"x".repeat(80)}`)
    expect(result.code).toBe(1)

    client.end()
  })

  test("closes an exec stream when an input line is too large", async () => {
    const client = await connectClient({
      port: portState.port,
      username: "line-tester",
      password: "pw",
    })

    const result = await new Promise<{ code: number; stderr: string }>((resolve, reject) => {
      client.exec("exec /usr/local/bin/opencode acp", (err, stream) => {
        if (err) {
          reject(err)
          return
        }
        const stderr: Array<Buffer> = []
        const state = { code: 0 }
        stream.resume()
        stream.stderr.on("data", (chunk: Buffer) => stderr.push(chunk))
        stream.on("exit", (code: number | null) => {
          state.code = code ?? 0
        })
        stream.on("close", () => {
          resolve({
            code: state.code,
            stderr: Buffer.concat(stderr).toString("utf8"),
          })
        })
        stream.write("x".repeat(64))
      })
    })

    expect(result.code).toBe(1)
    expect(result.stderr).toContain("line exceeds")

    client.end()
  })
})
