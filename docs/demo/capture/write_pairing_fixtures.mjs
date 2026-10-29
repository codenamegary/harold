#!/usr/bin/env node
// Keep the Remotion terminal in sync with the pairing code baked into the
// camera feed. The capture issues a fresh code on every run, so the committed
// CODE/EXPIRES values and the QR rows must be regenerated from that payload.
import fs from "node:fs"
import path from "node:path"
import qrcode from "qrcode"

const [pairingJson, renderSrc] = process.argv.slice(2)

if (!pairingJson || !renderSrc) {
  console.error("usage: write_pairing_fixtures.mjs <pair-json> <render-src>")
  process.exit(2)
}

let pairing
try {
  pairing = JSON.parse(pairingJson)
} catch (error) {
  console.error(`pair json is not valid JSON: ${error.message}`)
  process.exit(1)
}

for (const key of ["code", "qrUri", "expiresAt"]) {
  if (typeof pairing[key] !== "string" || pairing[key].length === 0) {
    console.error(`pair json is missing ${key}`)
    process.exit(1)
  }
}

const terminal = await qrcode.toString(pairing.qrUri, {
  type: "terminal",
  small: true,
})
const rows = terminal
  .replace(/\x1b\[[0-9;]*m/g, "")
  .replace(/\r/g, "")
  .split("\n")
if (rows[rows.length - 1] !== "") {
  rows.push("")
}

const qrRowsPath = path.join(renderSrc, "qr-rows.ts")
const qrRows = [
  "// Generated from the live pairing QR of the recorded capture",
  `// (${pairing.qrUri}).`,
  "// qrcode terminal + small mode, ANSI stripped. qr-matrix.ts decodes these",
  "// half-block rows back into a module grid that terminal.tsx draws as squares.",
  "export const qrRows: string[] = [",
  ...rows.map((row) => `  ${JSON.stringify(row)},`),
  "]",
  "",
].join("\n")
fs.writeFileSync(qrRowsPath, qrRows)

const terminalDataPath = path.join(renderSrc, "terminal-data.ts")
let terminalData = fs.readFileSync(terminalDataPath, "utf8")
terminalData = terminalData.replace(
  /export const CODE = "[^"]*"/,
  `export const CODE = ${JSON.stringify(pairing.code)}`,
)
terminalData = terminalData.replace(
  /export const EXPIRES = "[^"]*"/,
  `export const EXPIRES = ${JSON.stringify(pairing.expiresAt)}`,
)
fs.writeFileSync(terminalDataPath, terminalData)

console.log(`pairing fixtures updated: code=${pairing.code} expires=${pairing.expiresAt}`)
