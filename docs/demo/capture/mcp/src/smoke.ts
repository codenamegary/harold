#!/usr/bin/env bun
/**
 * Wiring check that needs no device: start the server over stdio, list tools,
 * and exit. Useful in CI and after editing the tool surface.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const SOURCE_DIR = dirname(fileURLToPath(import.meta.url))

const transport = new StdioClientTransport({
  command: "bun",
  args: ["run", join(SOURCE_DIR, "server.ts")],
  env: { ...(process.env as Record<string, string>), HAROLD_PROBE_TOKEN: "smoke" },
  stderr: "inherit",
})
const client = new Client({ name: "harold-probe-smoke", version: "0.0.0" })
await client.connect(transport)
const { tools } = await client.listTools()
console.log(`tools: ${tools.map((item) => item.name).sort().join(", ")}`)
await client.close()
process.exit(0)
