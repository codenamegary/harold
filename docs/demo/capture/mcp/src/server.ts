#!/usr/bin/env bun
/**
 * MCP server for the Harold debug app.
 *
 * MCP lives on the host on purpose. The app only exposes a loopback JSON
 * snapshot, so no protocol code ships in the APK and no listener exists in a
 * release build.
 *
 * Env:
 *   HAROLD_PROBE_URL    default http://127.0.0.1:7391
 *   HAROLD_PROBE_TOKEN  required, printed by the app as "HaroldProbe"
 *   HAROLD_PACKAGE      default harold.android.debug
 *   ANDROID_SERIAL      optional adb serial
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { configFromEnv, health } from "./probe"
import { registerProbeTools } from "./tools"

const config = configFromEnv()
const server = new McpServer({ name: "harold-probe", version: "0.1.0" })
registerProbeTools(server, config)

await server.connect(new StdioServerTransport())
console.error("harold-probe: mcp ready on stdio")

// Report reachability after the handshake, so a device that is not up yet never
// stalls the MCP handshake. Tools fail with the real error when called.
health(config).then(
  (status) => {
    console.error(
      `harold-probe: device reachable at ${config.baseUrl} (screen=${status.screen ?? "none"})`,
    )
  },
  (error: Error) => {
    console.error(
      `harold-probe: device not reachable at ${config.baseUrl}. ` +
        `Check adb forward and HAROLD_PROBE_TOKEN. ${error.message}`,
    )
  },
)
