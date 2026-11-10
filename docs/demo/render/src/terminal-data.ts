import { dim, lime, paper } from "./theme"

export type TermSeg = { text: string; color?: string; bold?: boolean }

export type TermItem =
  | { kind: "command"; at: number; typeAt?: number; text: string; cps: number }
  | { kind: "output"; at: number; segs: TermSeg[] }

// The demo host is fixed: docs/demo/fake-host/keys/ssh_host_ed25519_key.
export const FINGERPRINT = "SHA256:iKE0VpdoZwc0iRm1SFqsMzAm89GgjOX+tBGfqa4dJ8s"
export const SSH_ENDPOINT = "gary@127.0.0.1:2223"

export const promptSegs: TermSeg[] = [
  { text: "gary@couch", color: lime },
  { text: ":", color: paper },
  { text: "~" },
  { text: " $ ", color: dim },
]

// Printed after the phone saves the host. The terminal stays honest: the
// phone is the client, the host is just a normal OpenSSH server.
export const connectedSegs: TermSeg[] = [
  { text: "Accepted publickey for gary from the phone", color: lime },
  { text: "" },
  { text: "  scope  ", color: dim },
  { text: "exec + sftp only" },
  { text: "  agent  ", color: dim },
  { text: "opencode acp" },
]

// The host key the phone pins on first connect.
export const fingerprintSegs: TermSeg[][] = [
  [{ text: "Host key fingerprint" }],
  [{ text: `  ${FINGERPRINT}`, color: paper }],
]
