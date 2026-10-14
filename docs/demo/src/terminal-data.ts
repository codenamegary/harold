import { dim, lime, paper } from "./theme"

export type TermSeg = { text: string; color?: string; bold?: boolean }

export type TermItem =
  | { kind: "command"; at: number; text: string; cps: number }
  | { kind: "output"; at: number; segs: TermSeg[] }
  | { kind: "qr"; at: number; rowDelay: number }

// Values from the recorded capture (docs/demo-pipeline/capture.log and
// pair-code.txt). The daemon block is copied verbatim from this machine;
// expires is issued + 10 minutes (PAIRING_CODE_TTL_MS in
// packages/core device.create.pairing.code.usecase).
const CODE = "H5P-HQK"
const ENDPOINT = "http://127.0.0.1:3847"
const EXPIRES = "2026-10-13T12:33:02.346Z"
const PAIRED_AT = "2026-10-13T12:23:55.000Z"

// Same device row shape renderDeviceList prints in apps/cli device.render.ts.
const deviceWidths = [14, 19, 8, 6, 24]

const deviceHeader: TermSeg[] = [
  {
    text: ["ID", "NAME", "PLATFORM", "STATE", "PAIRED AT"]
      .map((label, index) => label.padEnd(deviceWidths[index]))
      .join("  ")
      .trimEnd(),
    color: dim,
  },
]

const deviceRow = (state: TermSeg): TermSeg[] => {
  const cells = ["device_9f3c81a2", "sdk_gphone64_x86_64", "android", "online"]
  const padded = cells.map((cell, index) => cell.padEnd(deviceWidths[index]))
  return [{ text: `${padded.slice(0, 3).join("  ")}  ` }, state, { text: `  ${PAIRED_AT}` }]
}

export const promptSegs: TermSeg[] = [
  { text: "codenamegary@harold", color: lime },
  { text: ":", color: paper },
  { text: "~" },
  { text: " $ ", color: dim },
]

/**
 * The terminal story, timed against the phone capture: start the daemon,
 * pair (the phone scans the QR on the virtual wall at `pairedSec`), then
 * look at the device list.
 */
export const transcript = (pairedSec: number): TermItem[] => [
  { kind: "command", at: 0.4, text: "harold start", cps: 11 },
  { kind: "output", at: 1.75, segs: [{ text: "Harold is running", color: paper, bold: true }] },
  { kind: "output", at: 1.95, segs: [{ text: "" }] },
  {
    kind: "output",
    at: 2.15,
    segs: [{ text: "  data dir             /home/codenamegary/.harold" }],
  },
  { kind: "output", at: 2.35, segs: [{ text: `  local api            ${ENDPOINT}` }] },
  { kind: "output", at: 2.55, segs: [{ text: `  advertised endpoint  ${ENDPOINT}` }] },
  {
    kind: "output",
    at: 2.75,
    segs: [{ text: "  agents               3 enabled, unknown needs auth" }],
  },
  { kind: "output", at: 2.95, segs: [{ text: "  workspaces           2" }] },
  { kind: "output", at: 3.15, segs: [{ text: "" }] },
  { kind: "output", at: 3.3, segs: [{ text: "Next step", color: paper, bold: true }] },
  { kind: "output", at: 3.45, segs: [{ text: "" }] },
  {
    kind: "output",
    at: 3.6,
    segs: [{ text: "  harold pair    " }, { text: "pair a device", color: dim }],
  },
  { kind: "command", at: 4.1, text: "harold pair", cps: 11 },
  {
    kind: "output",
    at: 5.35,
    segs: [{ text: "Pairing code issued. Scan the QR with the Harold app," }],
  },
  {
    kind: "output",
    at: 5.55,
    segs: [{ text: "or " }, { text: "type the code in manually", color: dim }, { text: "." }],
  },
  { kind: "output", at: 5.75, segs: [{ text: "" }] },
  {
    kind: "output",
    at: 5.95,
    segs: [{ text: "  code     " }, { text: CODE, color: paper, bold: true }],
  },
  { kind: "output", at: 6.15, segs: [{ text: `  endpoint ${ENDPOINT}` }] },
  { kind: "output", at: 6.35, segs: [{ text: `  expires  ${EXPIRES}` }] },
  { kind: "output", at: 6.6, segs: [{ text: "" }] },
  { kind: "qr", at: 6.9, rowDelay: 0.028 },
  { kind: "output", at: 8.05, segs: [{ text: "" }] },
  { kind: "output", at: 8.25, segs: [{ text: "Waiting for a device to scan..." }] },
  { kind: "output", at: pairedSec, segs: [{ text: "Device paired.", color: lime }] },
  { kind: "command", at: pairedSec + 2.5, text: "harold devices", cps: 14 },
  { kind: "output", at: pairedSec + 3.85, segs: deviceHeader },
  {
    kind: "output",
    at: pairedSec + 4.05,
    segs: deviceRow({ text: "online", color: lime }),
  },
  { kind: "output", at: pairedSec + 4.25, segs: [{ text: "" }] },
  { kind: "output", at: pairedSec + 4.45, segs: [{ text: "1 device", color: dim }] },
  { kind: "command", at: pairedSec + 5.3, text: "", cps: 14 },
]
