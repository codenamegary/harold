import { z } from "zod"
import { DEMO_HOST_KEY } from "./host.key"
import { createDemoSshServer } from "./ssh.server"

const EnvSchema = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(2222),
  /** Optional deployment override. The default demo key is embedded in source. */
  HOST_KEY: z.string().optional(),
  /** Adds an inactive 600 MB run so the app's 512 MB warning can be tested. */
  DEMO_SEED_WARNING_RUN: z.enum(["0", "1"]).default("0"),
})

const env = EnvSchema.parse(process.env)
const hostKey = env.HOST_KEY?.replace(/\\n/g, "\n") ?? DEMO_HOST_KEY

const server = createDemoSshServer({
  host: env.HOST,
  port: env.PORT,
  hostKey,
  seedWarningRun: env.DEMO_SEED_WARNING_RUN === "1",
})

const boundPort = await server.listen()
console.log(`harold-demo SSH server listening on ${env.HOST}:${boundPort}`)
