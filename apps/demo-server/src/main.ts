import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import { createDemoSshServer } from "./ssh.server"

const EnvSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(2222),
  HOST_KEY_PATH: z.string().optional(),
})

const env = EnvSchema.parse(process.env)
const defaultHostKeyPath = path.join(import.meta.dir, "..", "keys", "ssh_host_ed25519_key")
const hostKeyPath = env.HOST_KEY_PATH ?? defaultHostKeyPath
const hostKey = fs.readFileSync(hostKeyPath)

const server = createDemoSshServer({
  host: env.HOST,
  port: env.PORT,
  hostKey,
})

const boundPort = await server.listen()
console.log(`harold-demo SSH server listening on ${env.HOST}:${boundPort}`)
