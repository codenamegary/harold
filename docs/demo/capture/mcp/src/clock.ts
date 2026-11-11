/**
 * Device-to-host clock conversion for probe marks.
 *
 * The probe records marks on `SystemClock.elapsedRealtimeNanos()`. `harold_anchor`
 * samples that same clock, and the driver pairs the sample with the host
 * `performance.now()` taken immediately before the call. A linear least-squares
 * fit through those pairs maps every mark onto the host clock that `slices.json`
 * and `marks.log` already use, which is the piece the POC left out.
 *
 * The fit is deliberately paranoid. A slice with bad anchors is a slice whose
 * keys and marks would land on the wrong frames, and `build_capture.py` cannot
 * tell a wrong mapping from a wrong recording, so every guard below aborts.
 */

import type { ProbeMark } from "./probe"

export type AnchorSample = Readonly<{
  /** `elapsedRealtimeNanos` reported by the device. */
  deviceNanos: number
  /** Host monotonic seconds, the midpoint of the calls around the sample. */
  hostSec: number
  /** Full round trip of the anchor call, the worst case clock skew of this sample. */
  rttSec: number
}>

export type ClockFit = Readonly<{
  /** Host seconds per device second. Both clocks tick at real time, so about 1. */
  slope: number
  /** Host seconds at `deviceOriginSec`. */
  offsetSec: number
  deviceOriginSec: number
  /** Worst absolute residual across the anchor samples, in seconds. */
  residualSec: number
  samples: number
  deviceMinNanos: number
  deviceMaxNanos: number
}>

export type HostWindow = Readonly<{
  startedSec: number
  endedSec: number
}>

export type TimedMark = Readonly<{
  kind: string
  deviceNanos: number
  hostSec: number
}>

/**
 * Abort thresholds.
 *
 * `minSlope`/`maxSlope` are wide on purpose. A hardware-accelerated phone ticks
 * at real time, but this emulator's guest clock does not: measured on
 * `agent_server_api34` (swiftshader, WSL2), `elapsedRealtimeNanos` advances
 * 9-10% slower than the host's `performance.now()`, and the same lag is what
 * `build_capture.py` documents as encoder drift (its `driftRate` window is
 * 0.80-1.05 video-s per driver-s). A slope near 1.09 is therefore the correct
 * measurement here, not a broken anchor set. The guard still rejects a slope
 * that cannot be a clock relationship at all, and the residual and window
 * checks below are what actually prove the samples agree.
 *
 * `maxResidualSec` is six frames at 60 fps. It used to be 0.05, which the guest
 * clock cannot hold: the guest's clock rate moves with its own load (the
 * connection test's SSH handshake is a CPU spike), so a slice that peaks at
 * 74 ms of residual is the emulator ticking unevenly, not a bad pairing. The
 * anchors themselves are clean - their round trips are checked against
 * `maxRttSec` separately - and `build_capture.py` corrects the same rate change
 * from the blinks before anything reaches the render.
 */
export const clockLimits = {
  minSamples: 2,
  minResidualSamples: 3,
  maxRttSec: 0.5,
  maxResidualSec: 0.1,
  minSlope: 0.75,
  maxSlope: 1.35,
  maxExtrapolationSec: 2,
  windowToleranceSec: 2,
} as const

export const deviceSeconds = (nanos: number): number => nanos / 1e9

export const mapDeviceNanos = (fit: ClockFit, nanos: number): number =>
  fit.slope * (deviceSeconds(nanos) - fit.deviceOriginSec) + fit.offsetSec

type Point = Readonly<{ x: number; y: number }>

type Moments = Readonly<{ x: number; y: number; xx: number; xy: number }>

const addPoint = (moments: Moments, point: Point): Moments => ({
  x: moments.x + point.x,
  y: moments.y + point.y,
  xx: moments.xx + point.x * point.x,
  xy: moments.xy + point.x * point.y,
})

/**
 * Fit `hostSec = slope * (deviceSec - origin) + offsetSec`.
 *
 * Sample times are re-based on the first sample before the sums, because device
 * seconds are large (time since boot) and the variance across a slice is tiny,
 * which loses most of the precision of an uncentred normal equation.
 */
export const fitClock = (samples: readonly AnchorSample[]): ClockFit => {
  if (samples.length < clockLimits.minSamples) {
    throw new Error(
      `need at least ${clockLimits.minSamples} anchor samples, got ${samples.length}`,
    )
  }
  for (const sample of samples) {
    if (!Number.isFinite(sample.deviceNanos) || !Number.isFinite(sample.hostSec)) {
      throw new Error(`anchor sample is not finite: ${JSON.stringify(sample)}`)
    }
    if (sample.rttSec > clockLimits.maxRttSec) {
      throw new Error(
        `anchor round trip ${(sample.rttSec * 1000).toFixed(0)} ms is above the ` +
          `${(clockLimits.maxRttSec * 1000).toFixed(0)} ms limit; the probe is too slow to anchor`,
      )
    }
  }

  const deviceOriginSec = deviceSeconds(samples[0].deviceNanos)
  const points: readonly Point[] = samples.map((sample) => ({
    x: deviceSeconds(sample.deviceNanos) - deviceOriginSec,
    y: sample.hostSec,
  }))

  const count = points.length
  const moments = points.reduce<Moments>(addPoint, { x: 0, y: 0, xx: 0, xy: 0 })
  const denominator = count * moments.xx - moments.x * moments.x
  if (denominator === 0) {
    throw new Error("every anchor sampled the same device instant, so the clock fit has no slope")
  }

  const slope = (count * moments.xy - moments.x * moments.y) / denominator
  if (slope < clockLimits.minSlope || slope > clockLimits.maxSlope) {
    throw new Error(
      `clock slope ${slope.toFixed(6)} host-s per device-s is outside ` +
        `(${clockLimits.minSlope}, ${clockLimits.maxSlope}); the anchors are not on one clock`,
    )
  }
  const offsetSec = (moments.y - slope * moments.x) / count
  const residualSec = points.reduce(
    (worst, point) => Math.max(worst, Math.abs(point.y - (slope * point.x + offsetSec))),
    0,
  )
  if (count >= clockLimits.minResidualSamples && residualSec > clockLimits.maxResidualSec) {
    throw new Error(
      `anchor fit residual ${(residualSec * 1000).toFixed(1)} ms is above the ` +
        `${(clockLimits.maxResidualSec * 1000).toFixed(0)} ms limit; the anchors disagree`,
    )
  }

  const deviceNanos = samples.map((sample) => sample.deviceNanos)
  return {
    slope,
    offsetSec,
    deviceOriginSec,
    residualSec,
    samples: count,
    deviceMinNanos: Math.min(...deviceNanos),
    deviceMaxNanos: Math.max(...deviceNanos),
  }
}

/**
 * Convert one slice's device marks onto the host clock and prove they belong to
 * that slice. Rejects device marks that go backwards, marks outside the anchor
 * bracket, and marks that map outside the recorded window.
 */
export const mapMarks = (
  marks: readonly ProbeMark[],
  fit: ClockFit,
  window: HostWindow,
): readonly TimedMark[] => {
  const lowerNanos = fit.deviceMinNanos - clockLimits.maxExtrapolationSec * 1e9
  const upperNanos = fit.deviceMaxNanos + clockLimits.maxExtrapolationSec * 1e9

  const timed = marks.reduce<readonly TimedMark[]>((converted, mark, index) => {
    const previous = converted.at(-1)
    if (previous !== undefined && mark.nanos < previous.deviceNanos) {
      throw new Error(
        `device marks are not monotonic: ${mark.kind} at ${mark.nanos} follows ` +
          `${previous.kind} at ${previous.deviceNanos}`,
      )
    }
    if (mark.nanos < lowerNanos || mark.nanos > upperNanos) {
      throw new Error(
        `device mark ${index} (${mark.kind} at ${mark.nanos}) is more than ` +
          `${clockLimits.maxExtrapolationSec}s outside the anchor bracket; the ` +
          `slice was recorded with stale marks`,
      )
    }
    const hostSec = mapDeviceNanos(fit, mark.nanos)
    if (hostSec < window.startedSec - clockLimits.windowToleranceSec) {
      throw new Error(
        `device mark ${index} (${mark.kind}) maps to host ${hostSec.toFixed(3)}, ` +
          `before the slice started at ${window.startedSec.toFixed(3)}; the clock ` +
          `offset is absurd`,
      )
    }
    if (hostSec > window.endedSec + clockLimits.windowToleranceSec) {
      throw new Error(
        `device mark ${index} (${mark.kind}) maps to host ${hostSec.toFixed(3)}, ` +
          `after the slice ended at ${window.endedSec.toFixed(3)}; the clock ` +
          `offset is absurd`,
      )
    }
    if (previous !== undefined && hostSec < previous.hostSec) {
      throw new Error(
        `converted marks go backwards: ${mark.kind} maps to ${hostSec.toFixed(3)} ` +
          `after ${previous.kind} at ${previous.hostSec.toFixed(3)}`,
      )
    }
    return [...converted, { kind: mark.kind, deviceNanos: mark.nanos, hostSec }]
  }, [])

  return timed
}
