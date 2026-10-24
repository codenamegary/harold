import { describe, expect, test } from "bun:test"
import { celebrationStyle } from "./celebration"

const beat = { at: 10, hold: 1.3, strength: 1, confetti: false }

describe("celebrationStyle", () => {
  test("rests outside the beat", () => {
    expect(celebrationStyle([beat], 9.99)).toEqual({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotate: 0,
    })
    expect(celebrationStyle([beat], 11.31)).toEqual({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotate: 0,
    })
  })

  test("squashes wide and settles back", () => {
    const squash = celebrationStyle([beat], 10.13)

    expect(squash.scaleY).toBeLessThan(1)
    expect(squash.scaleX).toBeGreaterThan(1)
    expect(celebrationStyle([beat], 11.3).scaleY).toBeCloseTo(1, 5)
  })

  test("scales the squash with strength", () => {
    const full = celebrationStyle([beat], 10.13)
    const half = celebrationStyle([{ ...beat, strength: 0.5 }], 10.13)

    expect(Math.abs(half.scaleY - 1)).toBeLessThan(Math.abs(full.scaleY - 1))
  })
})
