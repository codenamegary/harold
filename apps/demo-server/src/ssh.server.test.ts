import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { generateKeyPairSync } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { Client, SFTPWrapper } from "ssh2"
import { createDemoSshServer } from "./ssh.server"

const HOST_KEY = fs.readFileSync(
  path.join(import.meta.dir, "..", "keys", "ssh_host_ed25519_key"),
  "utf8",
)

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
          JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n",
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
