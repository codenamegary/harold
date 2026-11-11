import { describe, expect, it } from "bun:test"
import { clockLimits, fitClock, mapDeviceNanos, mapMarks } from "./clock"
import type { AnchorSample } from "./clock"

const sample = (deviceSec: number, hostSec: number, rttSec = 0.004): AnchorSample => ({
  deviceNanos: deviceSec * 1e9,
  hostSec,
  rttSec,
})

const perfect = (): readonly AnchorSample[] => [sample(0, 10), sample(5, 15), sample(10, 20)]

const nanos = (deviceSec: number, kind: string) => ({ nanos: deviceSec * 1e9, kind })

describe("fitClock", () => {
  it("maps the device clock onto the host clock through a linear fit", () => {
    const fit = fitClock(perfect())
    expect(fit.slope).toBeCloseTo(1, 9)
    expect(fit.offsetSec).toBeCloseTo(10, 9)
    expect(fit.residualSec).toBeLessThan(1e-9)
    expect(fit.samples).toBe(3)
    expect(mapDeviceNanos(fit, 2.5e9)).toBeCloseTo(12.5, 9)
  })

  it("measures encoder-free skew away from 1.0 without rejecting it", () => {
    const fit = fitClock([sample(0, 10), sample(1, 11.002), sample(2, 12.004)])
    expect(fit.slope).toBeGreaterThan(1)
    expect(fit.slope).toBeLessThanOrEqual(clockLimits.maxSlope)
  })

  it("rejects a residual above the named threshold", () => {
    const bad = [sample(0, 10), sample(5, 15.2), sample(10, 20)]
    const limitMs = Math.round(clockLimits.maxResidualSec * 1000)
    expect(() => fitClock(bad)).toThrow(
      new RegExp(`residual .* ms is above the ${limitMs} ms limit`),
    )
  })

  it("rejects fewer than two samples", () => {
    expect(() => fitClock([sample(0, 10)])).toThrow(/need at least 2 anchor samples/)
  })

  it("rejects a round trip above the probe latency limit", () => {
    expect(() => fitClock([sample(0, 10, 0.6), sample(1, 11)])).toThrow(/round trip 600 ms/)
  })

  it("rejects a slope outside the clock bounds", () => {
    expect(() => fitClock([sample(0, 10), sample(1, 12), sample(2, 14)])).toThrow(
      /clock slope 2\.000000/,
    )
  })

  it("rejects anchors that sampled one instant", () => {
    expect(() => fitClock([sample(3, 10), sample(3, 11)])).toThrow(/no slope/)
  })

  it("rejects a non-finite sample", () => {
    expect(() => fitClock([sample(0, 10), sample(1, Number.NaN)])).toThrow(/not finite/)
  })
})

describe("mapMarks", () => {
  const window = { startedSec: 9, endedSec: 21 }

  it("converts every mark in ledger order", () => {
    const fit = fitClock(perfect())
    const timed = mapMarks([nanos(1, "key"), nanos(2, "key"), nanos(2, "keys_done")], fit, window)
    expect(timed.map((mark) => mark.kind)).toEqual(["key", "key", "keys_done"])
    expect(timed.map((mark) => mark.hostSec)).toEqual([11, 12, 12])
  })

  it("rejects device marks that go backwards", () => {
    const fit = fitClock(perfect())
    expect(() => mapMarks([nanos(5, "key"), nanos(4, "keys_done")], fit, window)).toThrow(
      /device marks are not monotonic/,
    )
  })

  it("rejects a mark further outside the anchor bracket than the extrapolation cap", () => {
    const fit = fitClock(perfect())
    expect(() => mapMarks([nanos(30, "key")], fit, window)).toThrow(
      /more than 2s outside the anchor bracket/,
    )
  })

  it("rejects a mark that maps before the slice started", () => {
    const fit = fitClock(perfect())
    expect(() => mapMarks([nanos(0, "key")], fit, { startedSec: 15, endedSec: 30 })).toThrow(
      /before the slice started/,
    )
  })

  it("rejects a mark that maps after the slice ended", () => {
    const fit = fitClock(perfect())
    expect(() => mapMarks([nanos(10, "key")], fit, { startedSec: 0, endedSec: 15 })).toThrow(
      /after the slice ended/,
    )
  })
})
