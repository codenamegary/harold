import { dim, lime, paper } from "./theme"

export type TermSeg = { text: string; color?: string; bold?: boolean }

export type TermItem =
  | { kind: "command"; at: number; typeAt?: number; text: string; cps: number }
  | { kind: "output"; at: number; segs: TermSeg[] }
  | { kind: "qr"; at: number; rowDelay: number }

// Values from the recorded one-instance capture (docs/demo/work/capture/
// capture.log, running.txt, and pair-code.txt). The code block mirrors
// `harold pair` output verbatim; expires is issued + 10 minutes
// (PAIRING_CODE_TTL_MS in packages/core device.create.pairing.code.usecase).
export const CODE = "NLT-R5W"
export const ENDPOINT = "http://127.0.0.1:3847"
export const EXPIRES = "2026-11-03T01:38:33.360Z"

export const promptSegs: TermSeg[] = [
  { text: "codenamegary@harold", color: lime },
  { text: ":", color: paper },
  { text: "~" },
  { text: " $ ", color: dim },
]

// Printed while the daemon waits for the phone to claim the pairing code.
export const waitingSegs: TermSeg[] = [{ text: "Waiting for a device to claim..." }]

// Printed after `harold start` once the terminal has zoomed back out.
// Labels are padded to the longest one, `workspaces`, using the same two-space
// separator as renderStatusSummary.
export const statusSegs: TermSeg[][] = [
  [{ text: "Harold is running", color: paper, bold: true }],
  [{ text: "" }],
  [{ text: "  data dir    /home/codenamegary/.harold-demo-3847" }],
  [{ text: `  local api   ${ENDPOINT}` }],
  [{ text: "  agents      1 enabled, unknown needs auth" }],
  [{ text: "  workspaces  4" }],
  [{ text: "" }],
  [{ text: "Next step", color: paper, bold: true }],
  [{ text: "" }],
  [{ text: "  harold pair    " }, { text: "pair a device", color: dim }],
]

// Printed after `harold pair`. Rows align with renderPairingSummary: labels
// are padded to `endpoint`, then two spaces, then the value.
export const pairSegs: TermSeg[][] = [
  [{ text: "Pairing code issued. Scan the QR with the Harold app," }],
  [{ text: "or " }, { text: "type the code in manually", color: dim }, { text: "." }],
  [{ text: "" }],
  [{ text: "  code      " }, { text: CODE, color: paper, bold: true }],
  [{ text: `  endpoint  ${ENDPOINT}` }],
  [{ text: `  expires   ${EXPIRES}` }],
]
