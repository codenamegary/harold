import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { generateKeyPairSync } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { Client } from "ssh2"
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

  test("serves SFTP realpath, readdir, read, write, and atomic rename", async () => {
    const client = await connectClient({
      port: portState.port,
      username: "sftp-tester",
      password: "pw",
    })

    const sftp = await new Promise<import("ssh2").SFTPWrapper>((resolve, reject) => {
      client.sftp((err, wrapper) => (err ? reject(err) : resolve(wrapper)))
    })

    const realHome = await new Promise<string>((resolve, reject) => {
      sftp.realpath(".", (err, abs) => (err ? reject(err) : resolve(abs)))
    })
    expect(realHome).toBe("/home/demo")

    const workspacesRaw = await new Promise<Buffer>((resolve, reject) => {
      sftp.readFile("/home/demo/.harold/workspaces.json", (err, data) =>
        err ? reject(err) : resolve(data),
      )
    })
    expect(workspacesRaw.toString("utf8")).toContain("cat-screensaver")

    await new Promise<void>((resolve, reject) => {
      sftp.writeFile("/home/demo/.harold/test.tmp", Buffer.from("ok"), (err) =>
        err ? reject(err) : resolve(),
      )
    })
    await new Promise<void>((resolve, reject) => {
      sftp.rename("/home/demo/.harold/test.tmp", "/home/demo/.harold/test.json", (err) =>
        err ? reject(err) : resolve(),
      )
    })
    const readBack = await new Promise<Buffer>((resolve, reject) => {
      sftp.readFile("/home/demo/.harold/test.json", (err, data) =>
        err ? reject(err) : resolve(data),
      )
    })
    expect(readBack.toString("utf8")).toBe("ok")

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
})
