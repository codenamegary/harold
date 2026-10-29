import { dim, lime, paper } from "./theme"

export type TermSeg = { text: string; color?: string; bold?: boolean }

export type TermItem =
  | { kind: "command"; at: number; typeAt?: number; text: string; cps: number }
  | { kind: "output"; at: number; segs: TermSeg[] }
  | { kind: "qr"; at: number; rowDelay: number }

// Values from the recorded capture (docs/demo/work/capture/capture.log and
// pair-code.txt). The code block mirrors `harold pair` output verbatim;
// expires is issued + 10 minutes (PAIRING_CODE_TTL_MS in
// packages/core device.create.pairing.code.usecase).
export const CODE = "BLU-KVM"
export const ENDPOINT = "http://127.0.0.1:3847"
export const EXPIRES = "2026-10-29T22:11:30.585Z"

export const promptSegs: TermSeg[] = [
  { text: "codenamegary@harold", color: lime },
  { text: ":", color: paper },
  { text: "~" },
  { text: " $ ", color: dim },
]

// Printed after `harold start` once the terminal has zoomed back out.
export const statusSegs: TermSeg[][] = [
  [{ text: "Harold is running", color: paper, bold: true }],
  [{ text: "" }],
  [{ text: "  data dir             /home/codenamegary/.harold-demo-3847" }],
  [{ text: `  local api            ${ENDPOINT}` }],
  [{ text: `  advertised endpoint  ${ENDPOINT}` }],
  [{ text: "  agents               2 enabled, unknown needs auth" }],
  [{ text: "  workspaces           4" }],
  [{ text: "" }],
  [{ text: "Next step", color: paper, bold: true }],
  [{ text: "" }],
  [{ text: "  harold pair    " }, { text: "pair a device", color: dim }],
]

// Printed after `harold pair`.
export const pairSegs: TermSeg[][] = [
  [{ text: "Pairing code issued. Scan the QR with the Harold app," }],
  [{ text: "or " }, { text: "type the code in manually", color: dim }, { text: "." }],
  [{ text: "" }],
  [{ text: "  code     " }, { text: CODE, color: paper, bold: true }],
  [{ text: `  endpoint ${ENDPOINT}` }],
  [{ text: `  expires  ${EXPIRES}` }],
]
