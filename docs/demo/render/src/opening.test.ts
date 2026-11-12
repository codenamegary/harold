import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { REST } from "./body"
import { ENTRANCE_SCALE, VERTICAL_FIT, phoneLayout, worldView } from "./camera"
import { stageCardBox } from "./copy"
import { LIGHTS, type LightShape, type WorldView } from "./stage"
import {
  ENTRANCE,
  ENTRANCE_FLOOR,
  FILLED,
  INTRO_FRAMES,
  INTRO_SEC,
  LAMP_ON_SEC,
  LIGHT_MOVE_EASE_SEC,
  LIGHT_MOVE_SEC,
  LOCKUP_FADE_SEC,
  LOCKUP_IN_SEC,
  LOCKUP_OUT_SEC,
  SSH_CARD_HOLD_SEC,
  SSH_CARD_SEC,
  SSH_HOME_HOLD_SEC,
  SSH_HOP_SEC,
  SSH_IDLE_GAIN,
  SSH_PUNCH_IN_EASE_SEC,
  SSH_PUNCH_IN_SEC,
  SSH_PUNCH_OUT_SEC,
  SSH_STEPS,
  SSH_WALK_SEC,
  SSH_ZOOM_EASE_SEC,
  SSH_ZOOM_SEC,
  entranceView,
  lampAt,
  openingCameraAt,
  openingIdleFrozenAt,
  openingIdleGainAt,
  openingLightAt,
  openingPoseAt,
  openingWaddleAt,
  type StageFrame,
} from "./opening"
import { FPS, buildTimeline, cards, type CaptureSlice } from "./timeline"

const capture = JSON.parse(
  readFileSync(new URL("../public/capture.json", import.meta.url), "utf8"),
) as { width: number; height: number; slices: CaptureSlice[] }

const timeline = () => buildTimeline(capture.slices)

const FRAME: StageFrame = {
  stageWidth: 1920,
  stageHeight: 1080,
  videoWidth: capture.width,
  videoHeight: capture.height,
}

const layoutOf = (camera: typeof ENTRANCE) =>
  phoneLayout(camera, FRAME.videoWidth, FRAME.videoHeight, FRAME.stageWidth, FRAME.stageHeight, {
    x: 0,
    y: 0,
  })

/** A world-space pool as the screen sees it, in stage px. */
const onScreen = (shape: LightShape, view: WorldView) => ({
  x: view.x + shape.centreX * FRAME.stageWidth * view.scale,
  y: view.y + shape.centreY * FRAME.stageHeight * view.scale,
  rx: shape.radiusX * FRAME.stageWidth * view.scale,
  ry: shape.radiusY * FRAME.stageHeight * view.scale,
})

describe("opening / lockup and light", () => {
  test("the intro holds its frames, then the SSH act starts", () => {
    expect(INTRO_SEC).toBeCloseTo(INTRO_FRAMES / FPS, 9)
    const t = timeline()
    expect(t.scenes[0].slug).toBe("intro")
    expect(t.scenes[0].frames).toBe(INTRO_FRAMES)
    expect(t.scenes[1].slug).toBe("ssh")
    expect(t.scenes[1].from).toBeCloseTo(INTRO_SEC, 9)
  })

  test("the lamp catches, dips, and comes up before the mark lands", () => {
    expect(lampAt(0)).toBe(0)
    expect(lampAt(LAMP_ON_SEC + 0.06)).toBeGreaterThan(0.6)
    expect(lampAt(LAMP_ON_SEC + 0.14)).toBeLessThan(lampAt(LAMP_ON_SEC + 0.06))
    expect(lampAt(LOCKUP_IN_SEC)).toBeGreaterThan(0.75)
    expect(lampAt(LAMP_ON_SEC + 1)).toBe(1)
    expect(openingLightAt(0, FRAME).shape.intensity).toBe(0)
  })

  test("the intro light is alone, exactly where the screen names it", () => {
    const light = openingLightAt(2, FRAME)
    expect(light.state).toBe("alone")
    const pool = onScreen(light.shape, entranceView(FRAME))
    expect(pool.x).toBeCloseTo(LIGHTS.alone.centreX * FRAME.stageWidth, 6)
    expect(pool.y).toBeCloseTo(LIGHTS.alone.centreY * FRAME.stageHeight, 6)
    expect(pool.rx).toBeCloseTo(LIGHTS.alone.radiusX * FRAME.stageWidth, 6)
    expect(pool.ry).toBeCloseTo(LIGHTS.alone.radiusY * FRAME.stageHeight, 6)
    expect(light.shape.intensity).toBeCloseTo(LIGHTS.alone.intensity, 9)
  })

  test("the lockup is gone before the phone steps on", () => {
    expect(LOCKUP_OUT_SEC - LOCKUP_IN_SEC).toBeGreaterThan(2.4)
    expect(LOCKUP_OUT_SEC + LOCKUP_FADE_SEC).toBeLessThan(INTRO_SEC)
  })

  test("the pool slides right, tightens and brightens as the lockup fades", () => {
    const view = entranceView(FRAME)
    expect(LIGHT_MOVE_SEC).toBeGreaterThanOrEqual(LOCKUP_OUT_SEC)
    const before = openingLightAt(LIGHT_MOVE_SEC - 0.001, FRAME)
    const middle = openingLightAt(LIGHT_MOVE_SEC + LIGHT_MOVE_EASE_SEC / 2, FRAME)
    const after = openingLightAt(LIGHT_MOVE_SEC + LIGHT_MOVE_EASE_SEC, FRAME)
    expect(before.state).toBe("alone")
    expect(middle.state).toBe("arrival")
    expect(onScreen(middle.shape, view).x).toBeGreaterThan(onScreen(before.shape, view).x)
    expect(onScreen(middle.shape, view).rx).toBeLessThan(onScreen(before.shape, view).rx)
    expect(middle.shape.intensity).toBeGreaterThan(before.shape.intensity)
    expect(middle.shape.intensity).toBeLessThan(after.shape.intensity)
    expect(after.shape).toEqual(LIGHTS.arrival)
    // The pool is in place while the phone is still walking to it.
    expect(LIGHT_MOVE_SEC + LIGHT_MOVE_EASE_SEC).toBeLessThan(INTRO_SEC + SSH_WALK_SEC / 2)
    expect(openingLightAt(INTRO_SEC + SSH_WALK_SEC, FRAME).shape).toEqual(LIGHTS.arrival)
  })
})

describe("opening / the stage follows the camera", () => {
  test("the world is drawn for the filled frame", () => {
    const view = worldView(layoutOf(FILLED), layoutOf(FILLED))
    expect(view.scale).toBeCloseTo(1, 9)
    expect(view.x).toBeCloseTo(0, 6)
    expect(view.y).toBeCloseTo(0, 6)
  })

  test("the wide shot sees the same world from further back", () => {
    const view = entranceView(FRAME)
    expect(view.scale).toBeCloseTo(ENTRANCE_SCALE / VERTICAL_FIT, 6)
    // The floor under the phone's feet stays under the phone's feet.
    const filled = layoutOf(FILLED)
    const wide = layoutOf(ENTRANCE)
    const feetX = view.x + (filled.left + filled.width / 2) * view.scale
    const feetY = view.y + (filled.top + filled.height) * view.scale
    expect(feetX).toBeCloseTo(wide.left + wide.width / 2, 6)
    expect(feetY).toBeCloseTo(wide.top + wide.height, 6)
  })

  test("the phone stands on the floor, inside the pool, lit from the left", () => {
    const wide = layoutOf(ENTRANCE)
    const feetX = wide.left + wide.width / 2
    const feetY = wide.top + wide.height
    expect(feetY).toBeCloseTo(ENTRANCE_FLOOR * FRAME.stageHeight, 6)
    const pool = onScreen(LIGHTS.arrival, entranceView(FRAME))
    const dx = (feetX - pool.x) / pool.rx
    const dy = (feetY - pool.y) / pool.ry
    expect(Math.sqrt(dx * dx + dy * dy)).toBeLessThan(0.5)
    expect(pool.x).toBeLessThan(feetX - wide.width * 0.3)
    // The pool is wider than the phone, so the phone stands in light.
    expect(pool.rx * 2).toBeGreaterThan(wide.width * 2)
  })
})

describe("opening / the phone as a character", () => {
  test("the phone walks in from off stage right, small and further back", () => {
    const wide = layoutOf(ENTRANCE)
    const start = openingPoseAt(INTRO_SEC)
    expect(wide.left + start.x).toBeGreaterThan(FRAME.stageWidth)
    expect(start.scale).toBeLessThan(0.8)
    expect(start.y).toBeLessThan(-20)
    expect(start.rotateY).toBeLessThan(-10)
    const middle = openingPoseAt(INTRO_SEC + SSH_WALK_SEC / 2)
    expect(middle.x).toBeLessThan(start.x)
    expect(middle.x).toBeGreaterThan(0)
    expect(middle.scale).toBeGreaterThan(start.scale)
    const end = openingPoseAt(INTRO_SEC + SSH_WALK_SEC)
    expect(end.x).toBeCloseTo(0, 6)
    expect(end.y).toBeCloseTo(0, 6)
    expect(end.scale).toBeCloseTo(1, 6)
    expect(end.rotateY).toBeCloseTo(0, 6)
  })

  test("the walk slows into the pool instead of stopping dead", () => {
    const step = 1 / FPS
    const early = openingPoseAt(INTRO_SEC + 0.2).x - openingPoseAt(INTRO_SEC + 0.2 + step).x
    const late =
      openingPoseAt(INTRO_SEC + SSH_WALK_SEC - 2 * step).x -
      openingPoseAt(INTRO_SEC + SSH_WALK_SEC - step).x
    expect(early).toBeGreaterThan(15)
    expect(late).toBeLessThan(early / 5)
  })

  test("the waddle snaps from corner to corner and rings down", () => {
    expect(SSH_WALK_SEC / SSH_STEPS).toBeLessThan(0.26)
    expect(openingWaddleAt(INTRO_SEC - 0.1)).toEqual(REST)
    expect(openingWaddleAt(INTRO_SEC + SSH_WALK_SEC + SSH_HOP_SEC + 0.01)).toEqual(REST)
    const stepSec = SSH_WALK_SEC / SSH_STEPS
    const first = openingWaddleAt(INTRO_SEC + stepSec * 0.5)
    const second = openingWaddleAt(INTRO_SEC + stepSec * 1.5)
    const last = openingWaddleAt(INTRO_SEC + stepSec * (SSH_STEPS - 0.5))
    expect(first.rotateZ * second.rotateZ).toBeLessThan(0)
    expect(Math.abs(first.rotateZ)).toBeGreaterThan(8)
    expect(Math.abs(last.rotateZ)).toBeLessThan(Math.abs(first.rotateZ) / 2)
    // Squared off: a quarter of the way into a step it is already most of the way over.
    const quarter = openingWaddleAt(INTRO_SEC + stepSec * 0.25)
    expect(Math.abs(quarter.rotateZ)).toBeGreaterThan(Math.abs(first.rotateZ) * 0.8)
    // Tipping onto a corner lifts it.
    expect(first.y).toBeLessThan(-10)
    // The last step lands flat, and the hop starts and ends on the floor.
    expect(Math.abs(openingWaddleAt(INTRO_SEC + SSH_WALK_SEC - 0.001).rotateZ)).toBeLessThan(0.5)
    expect(openingWaddleAt(INTRO_SEC + SSH_WALK_SEC + SSH_HOP_SEC / 2).y).toBeLessThan(-15)
    expect(Math.abs(openingWaddleAt(INTRO_SEC + SSH_WALK_SEC + 0.001).y)).toBeLessThan(1)
  })

  test("the idle walk eases in after the landing and out before the frame is filled", () => {
    expect(openingIdleGainAt(INTRO_SEC - 0.1)).toBe(0)
    expect(openingIdleGainAt(INTRO_SEC + SSH_WALK_SEC)).toBe(0)
    expect(openingIdleGainAt(INTRO_SEC + SSH_ZOOM_SEC - 0.3)).toBeCloseTo(SSH_IDLE_GAIN, 6)
    const leaving = openingIdleGainAt(INTRO_SEC + SSH_ZOOM_SEC + 0.1)
    expect(leaving).toBeGreaterThan(0)
    expect(leaving).toBeLessThan(SSH_IDLE_GAIN)
    expect(openingIdleGainAt(INTRO_SEC + SSH_ZOOM_SEC + SSH_ZOOM_EASE_SEC)).toBe(0)
    expect(openingIdleFrozenAt(INTRO_SEC + 0.2)).toBe(false)
    expect(openingIdleFrozenAt(INTRO_SEC + SSH_ZOOM_SEC + SSH_ZOOM_EASE_SEC + 0.05)).toBe(true)
    expect(openingIdleFrozenAt(INTRO_SEC - 0.1)).toBe(false)
  })

  test("a settled pose holds through the rest of SSH", () => {
    const t = timeline()
    const ssh = t.scenes[1]
    const settled = openingPoseAt(Math.min(ssh.from + 8, ssh.to - 1))
    expect(settled.x).toBeCloseTo(0, 4)
    expect(settled.rotateY).toBeCloseTo(0, 4)
    expect(settled.scale).toBeCloseTo(1, 4)
    expect(openingCameraAt(ssh.to - 0.05).scale).toBeCloseTo(VERTICAL_FIT, 2)
  })
})

describe("opening / camera", () => {
  test("the wide shot holds through the walk, then the push fills the frame", () => {
    const ssh = INTRO_SEC
    expect(openingCameraAt(1).scale).toBeCloseTo(ENTRANCE_SCALE, 6)
    expect(openingCameraAt(ssh + SSH_WALK_SEC).scale).toBeCloseTo(ENTRANCE_SCALE, 6)
    expect(SSH_ZOOM_SEC).toBeGreaterThan(SSH_WALK_SEC + SSH_HOP_SEC + 0.5)
    const half = openingCameraAt(ssh + SSH_ZOOM_SEC + SSH_ZOOM_EASE_SEC / 2)
    expect(half.scale).toBeGreaterThan(ENTRANCE_SCALE)
    expect(half.scale).toBeLessThan(VERTICAL_FIT)
    const filled = openingCameraAt(ssh + SSH_ZOOM_SEC + SSH_ZOOM_EASE_SEC)
    expect(filled.scale).toBeCloseTo(VERTICAL_FIT, 6)
    expect(filled.dock).toBeCloseTo(0.5, 6)
    expect(filled.focus.y).toBeCloseTo(0.5, 6)
  })

  test("the card lands as the phone does and leaves as the camera goes in", () => {
    const t = timeline()
    const ssh = t.scenes[1]
    const card = cards(t.copy)[0]
    expect(card.at).toBeCloseTo(ssh.from + SSH_CARD_SEC, 9)
    expect(SSH_CARD_SEC).toBeGreaterThan(SSH_WALK_SEC * 0.6)
    expect(SSH_CARD_SEC).toBeLessThan(SSH_WALK_SEC + SSH_HOP_SEC)
    expect(SSH_CARD_HOLD_SEC).toBeGreaterThanOrEqual(1.6)
    expect(Math.abs(SSH_CARD_SEC + SSH_CARD_HOLD_SEC - SSH_ZOOM_SEC)).toBeLessThan(0.2)
    // It stands beside the phone on the wide shot, clear of the handset and the frame.
    const wide = layoutOf(ENTRANCE)
    const box = stageCardBox(wide, FRAME.stageWidth)
    expect(box.onLeft).toBe(true)
    expect(box.left).toBeGreaterThan(48)
    expect(box.left + box.width).toBeLessThan(wide.left - wide.bezel - 48)
  })

  test("the camera punches in on Add connection, taps, then returns to the full phone", () => {
    const t = timeline()
    const ssh = t.scenes[1]
    const connect = capture.slices.find((item) => item.name === "connect")
    const taps = [...(connect?.taps ?? [])].sort((a, b) => a.atSec - b.atSec)
    const addTap = taps[0]
    const nameTap = taps[1]
    const form = t.shots.find((shot) => shot.scene === "ssh" && shot.slice === "connect")
    if (connect === undefined || addTap === undefined || nameTap === undefined || form === undefined) {
      throw new Error("connect has no Add connection tap")
    }
    // The empty home holds for the walk, the card and the push. Then the recording runs.
    expect(form.at - ssh.from).toBeCloseTo(SSH_HOME_HOLD_SEC, 6)
    expect(SSH_HOME_HOLD_SEC).toBeGreaterThan(SSH_ZOOM_SEC + SSH_ZOOM_EASE_SEC)
    expect(SSH_PUNCH_IN_SEC).toBeCloseTo(form.at - ssh.from, 3)
    const tapAt = form.at + (addTap.atSec - form.startSec)
    const filledAt = form.at + (nameTap.atSec - form.startSec)
    // The punch has landed and held a beat before the tap.
    expect(ssh.from + SSH_PUNCH_IN_SEC + SSH_PUNCH_IN_EASE_SEC).toBeLessThan(tapAt - 0.25)
    const punched = openingCameraAt(tapAt)
    expect(punched.scale).toBeGreaterThan(VERTICAL_FIT + 0.5)
    expect(punched.focus.y).toBeCloseTo(addTap.y / connect.height, 1)
    // It pulls back just after the tap, and is wide again before the next one.
    expect(ssh.from + SSH_PUNCH_OUT_SEC).toBeGreaterThan(tapAt + 0.1)
    expect(ssh.from + SSH_PUNCH_OUT_SEC).toBeLessThan(tapAt + 0.4)
    const wide = openingCameraAt(filledAt)
    expect(wide.scale).toBeCloseTo(VERTICAL_FIT, 2)
    expect(wide.focus.y).toBeCloseTo(0.5, 1)
    // The phone faces the camera squarely on the button and through the form.
    for (const pose of [openingPoseAt(tapAt), openingPoseAt(filledAt)]) {
      expect(pose.rotateX).toBeCloseTo(0, 6)
      expect(pose.rotateY).toBeCloseTo(0, 6)
      expect(pose.rotateZ).toBeCloseTo(0, 6)
    }
  })

  test("the camera never jumps", () => {
    const t = timeline()
    const ssh = t.scenes[1]
    const step = 1 / FPS
    const frames = Math.round(ssh.to * FPS)
    for (let frame = 1; frame < frames; frame += 1) {
      const before = openingCameraAt((frame - 1) * step)
      const now = openingCameraAt(frame * step)
      // The fastest move is the punch: 2x in under half a second. A cut would be far more.
      expect(Math.abs(Math.log(now.scale / before.scale))).toBeLessThan(0.2)
      expect(Math.abs(now.dock - before.dock)).toBeLessThan(0.02)
    }
  })
})
