import { describe, expect, test } from "bun:test"
import { renderPairingSummary } from "../../../../apps/cli/src/pair.render"
import { CODE, ENDPOINT, EXPIRES, pairSegs, statusSegs, waitingSegs } from "./terminal-data"

const text = (segs: { text: string }[]) => segs.map((seg) => seg.text).join("")

const terminalText = () => statusSegs.map(text).join("\n")
const pairingText = () => pairSegs.map(text).join("\n")

describe("terminal fixture", () => {
  test("does not advertise a second endpoint", () => {
    expect(terminalText()).not.toContain("advertised endpoint")
  })

  test("pads status labels to the longest label", () => {
    expect(text(statusSegs[2])).toBe("  data dir    /home/codenamegary/.harold-demo-3847")
    expect(text(statusSegs[3])).toBe(`  local api   ${ENDPOINT}`)
    expect(text(statusSegs[4])).toBe("  agents      1 enabled, unknown needs auth")
    expect(text(statusSegs[5])).toBe("  workspaces  4")
  })

  test("aligns the pairing rows with renderPairingSummary", () => {
    const rendered = renderPairingSummary({
      code: CODE,
      endpoint: ENDPOINT,
      expiresAt: EXPIRES,
      colors: { bold: (value) => value, dim: (value) => value },
    })

    expect(pairingText()).toBe(rendered)
  })

  test("waits for a device to claim", () => {
    expect(text(waitingSegs)).toBe("Waiting for a device to claim...")
  })
})
