import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { REST, idleGainForScale, poseAt, waddleAt, type BodyCue } from "./body"
import {
  CAMERA_EASE_SEC,
  ENTRANCE_SCALE,
  PHONE_FIT,
  PRESETS,
  VERTICAL_FIT,
  phoneDriftGain,
  phoneLayout,
  type CameraState,
} from "./camera"
import {
  FLARE_SPREAD,
  LIGHTS,
  PARALLAX,
  beamCone,
  beamHalfAt,
  lightAt,
  type LightState,
} from "./stage"
import {
  DRIFT_PERCENT,
  DRIFT_PERIOD_SEC,
  EDIT_SLICES,
  FPS,
  KEYBURSTS,
  MUSIC_VOLUME,
  SCENE_ORDER,
  activeClip,
  buildTimeline,
  callouts,
  cards,
  caps,
  channel,
  clipFrame,
  driftAt,
  firstTapAnchor,
  missingSlices,
  notes,
  spotlights,
  type CaptureSlice,
  type SceneSlug,
  type Shot,
  type Timeline,
} from "./timeline"
import { calloutCardBox, SPOT_COLUMN, SPOT_INSET, stageCardBox } from "./copy"
import { INTRO_FRAMES, SSH_ZOOM_EASE_SEC, SSH_ZOOM_SEC } from "./opening"
import { rimLevels } from "./phone"
import { CTA_HANDLE, SITE, SUBTITLE, lockupBox } from "./slides"

const capture = JSON.parse(
  readFileSync(new URL("../public/capture.json", import.meta.url), "utf8"),
) as { width: number; height: number; slices: CaptureSlice[] }

const REAL_SLICES = [
  "home_empty",
  "connect",
  "landing",
  "new_session",
  "plan",
  "question",
  "build",
  "usage",
  "changes",
  "worktrees",
  "pr",
]

const slice = (name: string): CaptureSlice => ({
  name,
  file: `slices/${name}.mp4`,
  durationSec: 4,
  width: 1080,
  height: 2400,
  taps: [{ x: 540, y: 1200, atSec: 0.5 }],
})

const STAGE_W = 1920
const STAGE_H = 1080
const VIDEO_W = 1080
const VIDEO_H = 2400

const timeline = (): Timeline => buildTimeline(capture.slices)

const shotsOf = (t: Timeline, scene: SceneSlug): Shot[] =>
  t.shots.filter((shot) => shot.scene === scene)

const drawnAt = (t: Timeline, sec: number): number => {
  const clip = activeClip(t.clips, sec)
  if (clip === null) {
    throw new Error(`no clip at ${sec}s`)
  }
  return clipFrame(clip, sec)
}

// --- Capture contract -------------------------------------------------------

describe("timeline / capture contract", () => {
  test("the edit names the slices it plays, in capture order", () => {
    expect([...EDIT_SLICES].sort()).toEqual([...REAL_SLICES].sort())
    expect(EDIT_SLICES).toEqual(REAL_SLICES)
    expect(missingSlices(capture.slices)).toEqual([])
  })

  test("buildTimeline never throws, whatever the capture contains", () => {
    expect(() => buildTimeline(capture.slices)).not.toThrow()
    expect(() => buildTimeline([])).not.toThrow()
    expect(buildTimeline([]).clips).toEqual([])
    expect(() => buildTimeline([...capture.slices, slice("not_captured")])).not.toThrow()
  })

  test("every shot stays inside its own slice", () => {
    const t = timeline()
    for (const shot of t.shots) {
      if (shot.hold) {
        expect(shot.startSec).toBeGreaterThanOrEqual(0)
        expect(shot.startSec).toBeLessThanOrEqual(shot.data.durationSec)
      } else {
        const drawnTo = shot.startSec + shot.duration * shot.rate
        expect(drawnTo).toBeLessThanOrEqual(shot.data.durationSec + 1e-6)
      }
      expect(shot.data.file.startsWith("slices/")).toBe(true)
      expect(shot.duration * FPS).toBeGreaterThan(2)
    }
  })

  test("each scene plays the footage its beats name", () => {
    const t = timeline()
    const byScene = (scene: SceneSlug): string[] => shotsOf(t, scene).map((shot) => shot.slice)
    expect(byScene("intro")).toEqual([])
    expect(byScene("ssh")).toEqual(["home_empty", "connect"])
    expect(byScene("achievement")).toEqual(["connect", "landing"])
    expect(byScene("newSession")).toEqual(["new_session"])
    expect(byScene("plan")).toEqual(["plan"])
    expect(byScene("question")).toEqual(["question"])
    expect(byScene("build")).toEqual(["build"])
    expect(byScene("usage")).toEqual(["usage"])
    expect(byScene("changes")).toEqual(["changes"])
    expect(byScene("worktrees")).toEqual(["worktrees"])
    expect(byScene("pr")).toEqual(["pr"])
    expect(byScene("outro")).toEqual([])
  })

  test("the achievement opens on the save tap and keeps playing", () => {
    const t = timeline()
    const connect = capture.slices.find((slice) => slice.name === "connect")
    const taps = [...(connect?.taps ?? [])].sort((a, b) => a.atSec - b.atSec)
    const tap = taps[taps.length - 1]
    if (connect === undefined || tap === undefined) {
      throw new Error("connect has no save tap")
    }
    const achievement = t.scenes.find((scene) => scene.slug === "achievement")
    const opening = shotsOf(t, "achievement")[0]
    const sshConnect = shotsOf(t, "ssh").find((shot) => shot.slice === "connect")
    if (achievement === undefined || sshConnect === undefined) {
      throw new Error("the save tap is not split across the hinge")
    }
    expect(opening.slice).toBe("connect")
    expect(opening.hold).toBe(false)
    expect(opening.startSec).toBeCloseTo(tap.atSec, 3)
    expect(sshConnect.startSec + sshConnect.duration).toBeCloseTo(tap.atSec, 3)
    expect(achievement.from).toBeCloseTo(opening.at, 3)
  })

})

// --- Scenes and light -------------------------------------------------------

describe("timeline / the scenes", () => {
  test("the scene order is the script's, twelve scenes", () => {
    expect(SCENE_ORDER).toEqual([
      "intro",
      "ssh",
      "achievement",
      "newSession",
      "plan",
      "question",
      "build",
      "usage",
      "changes",
      "worktrees",
      "pr",
      "outro",
    ])
    const scenes = timeline().scenes
    expect(scenes.length).toBe(12)
    expect(scenes[2].slug).toBe("achievement")
  })

  test("the film is as long as the recordings, plus the three graphic scenes", () => {
    const t = timeline()
    const frames = t.scenes.map((scene) => scene.frames)
    const total = frames.reduce((sum, value) => sum + value, 0)
    expect(total / FPS).toBeCloseTo(t.endSec, 9)
    expect(t.scenes[0].frames).toBe(INTRO_FRAMES)
    expect(t.scenes[t.scenes.length - 1].frames).toBe(150)
    const achievement = t.scenes.find((scene) => scene.slug === "achievement")
    if (achievement === undefined) {
      throw new Error("no achievement scene")
    }
    expect(achievement.frames).toBeGreaterThan(FPS * 4)
  })

  test("the scenes tile the timeline with no gap, on whole frames", () => {
    const scenes = timeline().scenes
    expect(scenes[0].from).toBe(0)
    scenes.forEach((scene, index) => {
      if (index > 0) {
        expect(scene.from).toBeCloseTo(scenes[index - 1].to, 9)
      }
      expect(Math.abs(scene.from * FPS - Math.round(scene.from * FPS))).toBeLessThan(1e-9)
      expect(scene.frames / FPS).toBeCloseTo(scene.to - scene.from, 9)
    })
    expect(scenes[scenes.length - 1].to).toBe(timeline().endSec)
  })

  test("every scene holds the light state the script names", () => {
    const expected: [SceneSlug, LightState][] = [
      ["intro", "alone"],
      ["ssh", "arrival"],
      ["achievement", "reward"],
      ["newSession", "work"],
      ["plan", "work"],
      ["question", "work"],
      ["build", "work"],
      ["usage", "work"],
      ["changes", "work"],
      ["worktrees", "work"],
      ["pr", "full"],
      ["outro", "alone"],
    ]
    const t = timeline()
    expect(t.scenes.map((scene) => [scene.slug, scene.light]) as [SceneSlug, LightState][]).toEqual(
      expected,
    )
    for (const scene of t.scenes) {
      // The state holds after its transition, so the shape is exact.
      expect(lightAt(t.lights, scene.from + 1.3).state).toBe(scene.light)
      expect(lightAt(t.lights, scene.from + 1.3).shape).toEqual(LIGHTS[scene.light])
      expect(lightAt(t.lights, (scene.from + scene.to) / 2).state).toBe(scene.light)
    }
  })

  test("the five light states are each used once, in act order", () => {
    const states: string[] = []
    for (const cue of timeline().lights) {
      if (states.indexOf(cue.state) === -1) {
        states.push(cue.state)
      }
    }
    // alone -> arrival -> reward -> work -> full. The outro returns to alone.
    expect(states).toEqual(["alone", "arrival", "reward", "work", "full"])
    expect(Object.keys(LIGHTS).length).toBe(5)
    const scenes = timeline().scenes
    const outro = scenes[scenes.length - 1]
    expect(outro.light).toBe("alone")
  })

  test("a light transition is smooth and then holds", () => {
    const t = timeline()
    const ssh = t.scenes[1]
    const reward = t.lights.find((cue) => cue.state === "reward")
    if (reward === undefined) {
      throw new Error("the cut has no reward light")
    }
    expect(lightAt(t.lights, ssh.from + 1.3).state).toBe("arrival")
    const before = lightAt(t.lights, reward.at - 0.01)
    const middle = lightAt(t.lights, reward.at + 0.6)
    const after = lightAt(t.lights, reward.at + 1.2)
    expect(before.state).toBe("arrival")
    expect(middle.state).toBe("reward")
    expect(middle.shape.flare).toBeGreaterThan(before.shape.flare)
    expect(after.shape).toEqual(LIGHTS.reward)
  })

  test("only the intro and the outro are graphics-only scenes", () => {
    const t = timeline()
    const silent = t.scenes.filter((scene) => shotsOf(t, scene.slug).length === 0)
    expect(silent.map((scene) => scene.slug)).toEqual(["intro", "outro"])
  })
})

// --- Camera and layout ------------------------------------------------------

describe("timeline / camera", () => {
  test("the presets describe framing, not features", () => {
    expect(Object.keys(PRESETS).sort()).toEqual([
      "center-two-thirds",
      "full",
      "lower-center",
      "lower-right",
      "right-full",
      "top-two-thirds",
      "upper-center",
    ])
    expect(PRESETS.full.scale).toBe(1)
    expect(PRESETS["right-full"].dock).toBeGreaterThan(PRESETS.full.dock)
    expect(PRESETS["top-two-thirds"].scale).toBe(2)
    expect(PRESETS["center-two-thirds"].scale).toBe(2)
    expect(PRESETS["lower-center"].scale).toBe(1.7)
    expect(PRESETS["lower-right"].scale).toBe(2.6)
    expect(PRESETS["upper-center"].scale).toBe(1.6)
    expect(PRESETS["lower-right"].focus.y).toBeGreaterThan(0.5)
    expect(PRESETS["upper-center"].focus.y).toBeLessThan(0.5)
  })

  test("the usage scene honours the script's zoom exactly", () => {
    const t = timeline()
    const usage = t.scenes.find((scene) => scene.slug === "usage")
    if (usage === undefined) {
      throw new Error("no usage scene")
    }
    const state = t.cameraAt(usage.from + CAMERA_EASE_SEC + 0.05)
    expect(state.preset).toBe("upper-center")
    expect(state.scale).toBe(2.2)
    expect(state.focus).toEqual({ x: 0.5, y: 0.08 })
    // The cost line is inside the frame at that framing.
    const layout = phoneLayout(state, VIDEO_W, VIDEO_H, STAGE_W, STAGE_H, { x: 0, y: 0 })
    const costLine = layout.top + 0.1325 * layout.height
    expect(costLine).toBeGreaterThan(0)
    expect(costLine).toBeLessThan(STAGE_H * 0.5)
  })

  test("a camera state holds until the next one", () => {
    const t = timeline()
    const newSession = t.scenes.find((scene) => scene.slug === "newSession")
    if (newSession === undefined) {
      throw new Error("no newSession scene")
    }
    const wide = t.cameraAt(newSession.from + CAMERA_EASE_SEC + 0.05)
    const mid = t.cameraAt(newSession.from + 1.9 + CAMERA_EASE_SEC * 0.45)
    const form = t.cameraAt(newSession.from + 1.9 + CAMERA_EASE_SEC + 0.05)
    const back = t.cameraAt(newSession.from + 3.6 + CAMERA_EASE_SEC + 0.05)
    expect(wide.preset).toBe("full")
    expect(wide.scale).toBe(1)
    expect(form.preset).toBe("center-two-thirds")
    expect(form.scale).toBe(2)
    expect(back.preset).toBe("full")
    expect(mid.scale).toBeGreaterThan(wide.scale)
    expect(mid.scale).toBeLessThan(form.scale)
    expect(t.cameraAt(newSession.from + 1.5).scale).toBe(wide.scale)
  })

  test("1x is the whole handset, and any push covers the frame", () => {
    const wide = phoneLayout(PRESETS.full, VIDEO_W, VIDEO_H, STAGE_W, STAGE_H, { x: 0, y: 0 })
    expect(wide.height).toBeCloseTo(STAGE_H * PHONE_FIT, 6)
    expect(wide.width).toBeCloseTo((STAGE_H * PHONE_FIT * VIDEO_W) / VIDEO_H, 6)
    expect(wide.width).toBeLessThan(STAGE_W * 0.3)
    for (const preset of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
      const state = PRESETS[preset]
      const layout = phoneLayout(state, VIDEO_W, VIDEO_H, STAGE_W, STAGE_H, { x: 0, y: 0 })
      if (layout.height <= STAGE_H) {
        continue
      }
      // A phone taller than the stage must not leave ink above or below it.
      expect(layout.top).toBeLessThanOrEqual(1e-6)
      expect(layout.top + layout.height).toBeGreaterThanOrEqual(STAGE_H - 1e-6)
    }
  })

  test("a push is clamped to the frame, a wide shot is free to stand in the light", () => {
    const tight: CameraState = {
      preset: "lower-right",
      scale: 5,
      focus: { x: 0.78, y: 0.9 },
      dock: 0.5,
    }
    const push = phoneLayout(tight, VIDEO_W, VIDEO_H, STAGE_W, STAGE_H, { x: 0, y: 0 })
    expect(push.width).toBeGreaterThan(STAGE_W)
    expect(push.left).toBeLessThanOrEqual(1e-6)
    expect(push.left + push.width).toBeGreaterThanOrEqual(STAGE_W - 1e-6)
    expect(push.top).toBeLessThanOrEqual(1e-6)
    expect(push.top + push.height).toBeGreaterThanOrEqual(STAGE_H - 1e-6)
    // A push that is still narrower than the stage keeps its dock.
    const wide = phoneLayout(
      { ...tight, scale: 2.6 },
      VIDEO_W,
      VIDEO_H,
      STAGE_W,
      STAGE_H,
      { x: 0, y: 0 },
    )
    expect(wide.width).toBeLessThan(STAGE_W)
    expect(wide.left + wide.width / 2).toBeCloseTo(STAGE_W * 0.5, 6)
  })
})

// --- Stage ------------------------------------------------------------------

describe("timeline / the stage", () => {
  test("parallax never moves all three layers at one speed", () => {
    expect(PARALLAX.pool).toBeLessThan(PARALLAX.phone)
    expect(PARALLAX.phone).toBeLessThan(PARALLAX.haze)
    const speeds = [PARALLAX.back, PARALLAX.pool, PARALLAX.phone, PARALLAX.haze]
    expect(new Set(speeds).size).toBe(4)
  })

  test("every scene drifts at one to two percent of frame width per second", () => {
    for (const scene of timeline().scenes) {
      expect(Math.abs(scene.drift)).toBeGreaterThanOrEqual(1)
      expect(Math.abs(scene.drift)).toBeLessThanOrEqual(2)
    }
  })

  test("the five light states are different pictures", () => {
    const { alone, arrival, reward, work, full } = LIGHTS
    // Alone is wide and dim, centred under the lockup.
    expect(alone.intensity).toBeLessThan(0.5)
    expect(alone.radiusX).toBeGreaterThan(work.radiusX * 2)
    expect(alone.centreX).toBeCloseTo(0.5, 2)
    expect(alone.haze).toBeLessThan(arrival.haze)
    // Arrival is brighter and sits to one side of the centred phone.
    expect(arrival.intensity).toBeGreaterThan(alone.intensity + 0.3)
    expect(arrival.centreX).toBeLessThan(work.centreX - 0.05)
    expect(arrival.radiusX).toBeGreaterThan(work.radiusX + 0.08)
    expect(arrival.haze).toBeGreaterThan(work.haze + 0.3)
    expect(work.haze).toBeLessThan(0.35)
    expect(work.radiusX).toBeLessThan(0.16)
    expect(reward.flare).toBeGreaterThan(0.5)
    expect(arrival.flare).toBeLessThan(0.5)
    expect(work.flare).toBeLessThan(0.5)
    expect(full.flare).toBeLessThan(0.5)
    expect(reward.centreX - reward.radiusX * FLARE_SPREAD).toBeGreaterThan(0.4)
    expect(full.radiusX).toBeGreaterThan(work.radiusX * 2.5)
    expect(full.centreX).toBeCloseTo(0.5, 1)
    expect(reward.haze).toBeGreaterThan(work.haze)
  })

  test("a side light hits one edge harder, a pool under the phone hits both", () => {
    const phone = { poolRadius: 600, phoneCenter: 960, phoneWidth: 400 }
    const fromLeft = rimLevels({ ...phone, poolX: 700 })
    expect(fromLeft.left).toBeGreaterThan(fromLeft.right + 0.4)
    const fromRight = rimLevels({ ...phone, poolX: 1220 })
    expect(fromRight.right).toBeGreaterThan(fromRight.left + 0.4)
    const under = rimLevels({ ...phone, poolX: 960 })
    expect(under.left).toBeCloseTo(under.right, 9)
    expect(under.left).toBeGreaterThan(0.5)
  })

  test("a phone out in the dark has not earned the light", () => {
    const pool = { poolX: 700, poolRadius: 300, phoneWidth: 200 }
    const inside = rimLevels({ ...pool, phoneCenter: 780 })
    const far = rimLevels({ ...pool, phoneCenter: 1700 })
    expect(far.left).toBeLessThan(inside.left * 0.2)
    // The levels are continuous, so a drifting phone never pops a rim.
    const a = rimLevels({ ...pool, phoneCenter: 770 })
    const b = rimLevels({ ...pool, phoneCenter: 771 })
    expect(Math.abs(a.left - b.left)).toBeLessThan(0.01)
    expect(Math.abs(a.right - b.right)).toBeLessThan(0.01)
  })

  test("drift is one wave, so a shot change cannot snap the phone", () => {
    const t = timeline()
    expect(driftAt(0, STAGE_W).x).toBeCloseTo(0, 6)
    const cut = shotsOf(t, "ssh")[1].at
    const before = driftAt(cut - 1 / FPS, STAGE_W).x
    const after = driftAt(cut + 1 / FPS, STAGE_W).x
    expect(Math.abs(after - before)).toBeLessThan(3)
    const speed = (DRIFT_PERCENT / 100) * STAGE_W
    const amp = (speed * DRIFT_PERIOD_SEC) / (2 * Math.PI)
    const later = driftAt(2, STAGE_W).x
    expect(Math.abs(later)).toBeLessThanOrEqual(amp + 1e-6)
    expect(Math.abs(later)).toBeGreaterThan(1)
    expect(later * PARALLAX.pool).not.toBeCloseTo(later, 3)
  })

  test("the shaft lands on the pool circle", () => {
    const drift = 80
    for (const shape of Object.values(LIGHTS)) {
      const cone = beamCone(shape, STAGE_W, STAGE_H, drift)
      // The foot is the pool ellipse: same centre, same radii, same drift.
      expect(cone.footX).toBeCloseTo(shape.centreX * STAGE_W + drift * PARALLAX.pool, 6)
      expect(cone.footY).toBeCloseTo(shape.centreY * STAGE_H, 6)
      expect(cone.footHalfX).toBeCloseTo(shape.radiusX * STAGE_W, 6)
      expect(cone.footHalfY).toBeCloseTo(shape.radiusY * STAGE_H, 6)
      expect(beamHalfAt(cone, cone.footY)).toBeCloseTo(cone.footHalfX, 6)
      // The lamp is straight above the pool, above the frame, and narrow.
      expect(cone.apexX).toBeCloseTo(cone.footX, 6)
      expect(cone.apexY).toBeLessThan(0)
      expect(cone.apexHalf).toBeLessThan(cone.footHalfX * 0.2)
      expect(beamHalfAt(cone, 0)).toBeLessThan(cone.footHalfX)
    }
  })
})

// --- Body language ----------------------------------------------------------

describe("timeline / the phone as a character", () => {
  test("the work scenes do not waddle. The SSH walk lives in the opening act", () => {
    expect(timeline().waddles).toEqual([])
  })

  test("the waddle rings down to nothing", () => {
    const waddle = { at: 0, duration: 1.5 }
    expect(waddleAt(waddle, -0.1)).toEqual(REST)
    expect(waddleAt(waddle, 1.6)).toEqual(REST)
    expect(Math.abs(waddleAt(waddle, 0.2).rotateZ)).toBeGreaterThan(0)
    const early = Math.abs(waddleAt(waddle, 0.2).rotateZ)
    const late = Math.abs(waddleAt(waddle, 1.3).rotateZ)
    expect(early).toBeGreaterThan(late)
    const mid = waddleAt(waddle, 0.4)
    expect(Math.abs(mid.rotateZ)).toBeGreaterThan(0)
  })

  test("the idle walk stops once the SSH zoom has filled the frame", () => {
    const t = timeline()
    const ssh = t.scenes[1]
    expect(t.idleFrozenAt(ssh.from + 0.2)).toBe(false)
    expect(t.idleFrozenAt(ssh.from + SSH_ZOOM_SEC + SSH_ZOOM_EASE_SEC + 0.05)).toBe(true)
    expect(t.idleFrozenAt(t.scenes[2].from + 0.2)).toBe(false)
  })

  test("a zoomed-in phone does not take the camera drift", () => {
    expect(phoneDriftGain(1)).toBe(1)
    expect(phoneDriftGain(ENTRANCE_SCALE)).toBe(1)
    expect(phoneDriftGain(VERTICAL_FIT)).toBe(0)
    expect(phoneDriftGain(2.4)).toBe(0)
    const wide = phoneLayout(PRESETS.full, VIDEO_W, VIDEO_H, STAGE_W, STAGE_H, { x: 40, y: 0 })
    const still = phoneLayout(
      { ...PRESETS.full, scale: VERTICAL_FIT },
      VIDEO_W,
      VIDEO_H,
      STAGE_W,
      STAGE_H,
      { x: 40 * phoneDriftGain(VERTICAL_FIT), y: 0 },
    )
    const stillOther = phoneLayout(
      { ...PRESETS.full, scale: VERTICAL_FIT },
      VIDEO_W,
      VIDEO_H,
      STAGE_W,
      STAGE_H,
      { x: 80 * phoneDriftGain(VERTICAL_FIT), y: 0 },
    )
    expect(wide.left).not.toBeCloseTo(wide.left - 40, 4)
    expect(still.left).toBeCloseTo(stillOther.left, 6)
  })

  test("every scene with footage states its body language on the cut", () => {
    const t = timeline()
    for (const scene of t.scenes) {
      if (scene.slug === "intro" || scene.slug === "outro") {
        continue
      }
      const cue = t.bodies.find((entry) => Math.abs(entry.at - scene.from) < 1e-9)
      expect(cue).toBeDefined()
    }
  })

  test("it leans in while working and sits back when the agent works", () => {
    const t = timeline()
    const plan = t.scenes.find((scene) => scene.slug === "plan")
    const question = t.scenes.find((scene) => scene.slug === "question")
    if (plan === undefined || question === undefined) {
      throw new Error("missing scenes")
    }
    // plan leans in: turned towards the camera and scaled up.
    const leaning = poseAt(t.bodies, plan.from + 3)
    expect(leaning.rotateY).toBeLessThan(0)
    expect(leaning.scale).toBeGreaterThan(1)
    // question sits back: turned away and pushed back.
    const sitting = poseAt(t.bodies, question.from + 0.5)
    expect(sitting.rotateY).toBeGreaterThan(0)
    expect(sitting.scale).toBeLessThan(1)
  })

  test("it turns to present its screen when it has something to show", () => {
    const t = timeline()
    const changes = t.scenes.find((scene) => scene.slug === "changes")
    if (changes === undefined) {
      throw new Error("no changes scene")
    }
    const turning = poseAt(t.bodies, changes.from + 0.1)
    const presented = poseAt(t.bodies, changes.from + 6)
    expect(turning.rotateY).toBeLessThan(-8)
    expect(presented.rotateY).toBeLessThan(-8)
  })

  test("a held pose is still animated by the sway", () => {
    const cues: BodyCue[] = [{ at: 0, pose: { ...REST } }]
    expect(poseAt(cues, 4)).toEqual(REST)
  })

  test("a pose holds through the scene instead of drifting toward the next one", () => {
    const t = timeline()
    const ssh = t.scenes[1]
    const settledAt = Math.min(ssh.from + 8, ssh.to - 1)
    const settled = poseAt(t.bodies, settledAt)
    expect(settled.x).toBeCloseTo(0, 4)
    expect(settled.rotateY).toBeCloseTo(0, 4)
    expect(settled.scale).toBeCloseTo(1, 4)
    const plan = t.scenes.find((scene) => scene.slug === "plan")
    const question = t.scenes.find((scene) => scene.slug === "question")
    if (plan === undefined || question === undefined) {
      throw new Error("missing scenes")
    }
    const leaning = poseAt(t.bodies, Math.min(plan.from + 3, plan.to - 1))
    const stillLeaning = poseAt(t.bodies, Math.min(plan.from + 10, plan.to - 1))
    expect(stillLeaning.rotateY).toBeCloseTo(leaning.rotateY, 4)
    expect(stillLeaning.scale).toBeCloseTo(leaning.scale, 4)
    const sitting = poseAt(t.bodies, Math.min(question.from + 4, question.to - 1))
    expect(sitting.rotateY).toBeGreaterThan(8)
    expect(sitting.scale).toBeLessThan(1)
    expect(idleGainForScale(1)).toBe(1)
    expect(idleGainForScale(2.2)).toBeLessThan(1)
  })
})

// --- Copy -------------------------------------------------------------------

describe("timeline / the copy is the script's", () => {
  test("every copy string is the script's, verbatim and in order", () => {
    const t = timeline()
    const lines = t.copy.map((item) => {
      switch (item.kind) {
        case "card":
          return `CARD ${item.title}${item.place === "stage" ? " [stage]" : ""}`
        case "callout":
          return `CALLOUT ${item.eyebrow ?? ""} ${item.title}${item.hint === undefined ? "" : ` | ${item.hint}`}`
        case "spotlight":
          return `SPOTLIGHT ${item.kicker} / ${item.title}`
        case "note":
          return `NOTE ${item.label} / ${item.title}`
        case "box":
          return `BOX ${item.steps.map((step) => step.title).join(" -> ")}`
        case "cap":
          return `CAP ${item.text}`
      }
    })
    expect(lines).toEqual([
      "CARD Look what I can do! [stage]",
      "SPOTLIGHT Achievement unlocked / Work from Couch",
      "NOTE NEW SESSION / Start something new",
      "CALLOUT PLAN Use your agent’s plan mode",
      "CALLOUT ATTACHMENTS Give it the spec | A markdown file and a photo of Mia.",
      "CALLOUT AGENT QUESTION Get grilled | Interactive question tooling.",
      "CALLOUT BUILD Execute the plan",
      "CALLOUT USAGE Know what it cost | Tokens and dollars, in the header.",
      "CALLOUT CHANGES Review the code",
      "CALLOUT CHANGES Pretty diffs!",
      "CALLOUT WORKTREES Auto-detect, or choose | Pick the worktree to inspect.",
      "CALLOUT DRAFT PR Just like always | The agent pushes and opens it.",
      "SPOTLIGHT The whole loop / From plan to PR",
    ])
  })

  test("the curly apostrophe and the punctuation survive", () => {
    const plan = callouts(timeline().copy).find((item) => item.eyebrow === "PLAN")
    expect(plan?.title).toBe("Use your agent\u2019s plan mode")
    expect(plan?.title.indexOf("'")).toBe(-1)
    const diff = callouts(timeline().copy).find((item) => item.title === "Pretty diffs!")
    expect(diff).toBeDefined()
    expect(diff?.title.endsWith("!")).toBe(true)
  })

  test("primitive inventory: one card, one note, two spotlights, nine callouts", () => {
    const t = timeline()
    expect(cards(t.copy).length).toBe(1)
    expect(notes(t.copy).length).toBe(1)
    expect(spotlights(t.copy).length).toBe(2)
    expect(callouts(t.copy).length).toBe(9)
    // No scene uses BOX or CAP: they are vocabulary, not copy.
    expect(t.copy.filter((item) => item.kind === "box")).toEqual([])
    expect(caps(t.copy)).toEqual([])
  })

  test("the note carries its tape label", () => {
    const note = notes(timeline().copy)[0]
    expect(note.label).toBe("NEW SESSION")
    expect(note.title).toBe("Start something new")
  })

  test("callouts anchor to the first tap of their shot when there is one", () => {
    const t = timeline()
    // The capture ships taps only up to connect, so every callout in the
    // film falls back to the script's targetX/targetY override.
    for (const callout of callouts(t.copy)) {
      expect(callout.anchoredBy).toBe("point")
      expect(callout.target.x).toBeGreaterThan(0)
      expect(callout.target.x).toBeLessThan(1)
      expect(callout.target.y).toBeGreaterThan(0)
      expect(callout.target.y).toBeLessThan(1)
    }
    // The rule itself, on a shot that does have taps.
    const withTaps = t.shots.find((shot) => (shot.data.taps ?? []).length > 0)
    if (withTaps === undefined) {
      throw new Error("the capture has no taps")
    }
    const anchor = firstTapAnchor(t.shots, withTaps.at + 0.01)
    const first = (withTaps.data.taps ?? [])[0]
    expect(anchor).toEqual({ x: first.x / 1080, y: first.y / 2400 })
  })

  test("compact edge callouts use the T bracket, the rest use the string", () => {
    const items = callouts(timeline().copy)
    const bracketed = items.filter((item) => item.connector === "t")
    expect(bracketed.length).toBe(5)
    for (const item of bracketed) {
      expect(item.compact).toBe(true)
      expect(item.placement).toBe("edge")
    }
    for (const item of items) {
      if (item.connector === "string") {
        // The T bracket is only used for the compact edge tags.
        expect(item.compact).toBe(false)
      }
    }
  })

  test("a tag sits on the side its target is on, so the line crosses one bezel", () => {
    for (const item of callouts(timeline().copy)) {
      if (item.target.x > 0.5) {
        expect(item.side).toBe("right")
      }
      if (item.target.x < 0.5) {
        expect(item.side).toBe("left")
      }
    }
  })

  test("copy stays off the handset", () => {
    const wide = phoneLayout(PRESETS.full, VIDEO_W, VIDEO_H, STAGE_W, STAGE_H, { x: 0, y: 0 })
    expect(SPOT_INSET + SPOT_COLUMN).toBeLessThan(wide.left - wide.bezel - 48)
    const card = stageCardBox(wide, STAGE_W)
    const frameLeft = wide.left - wide.bezel
    const cardRight = card.left + card.width
    expect(card.onLeft).toBe(true)
    expect(cardRight).toBeLessThan(frameLeft - 48)
    const usage = phoneLayout(
      { preset: "upper-center", scale: 2.2, focus: { x: 0.5, y: 0.08 }, dock: 0.5 },
      VIDEO_W,
      VIDEO_H,
      STAGE_W,
      STAGE_H,
      { x: 0, y: 0 },
    )
    const tag = calloutCardBox({
      compact: true,
      placement: "edge",
      side: "left",
      anchorX: usage.left + usage.width * 0.5,
      anchorY: usage.top + usage.height * 0.13,
      layout: usage,
      stageW: STAGE_W,
      stageH: STAGE_H,
    })
    expect(tag.left).toBeGreaterThanOrEqual(24)
    expect(tag.left + tag.width).toBeLessThan(usage.left - usage.bezel - 8)
  })

  test("the spotlight kickers are sentence case, as written", () => {
    for (const item of spotlights(timeline().copy)) {
      expect(item.kicker).not.toBe(item.kicker.toUpperCase())
      expect(item.side).toBe("left")
    }
    expect(spotlights(timeline().copy).map((item) => item.kicker)).toEqual([
      "Achievement unlocked",
      "The whole loop",
    ])
  })

  test("the slides carry the script's title, CTA and site", () => {
    expect(SUBTITLE).toBe("Hark! The Harold Agents Sing")
    expect(CTA_HANDLE).toBe("codenamegary/harold")
    expect(SITE).toBe("harold.codenamegary.com")
  })

  test("the lockup sits in the shaft, above the pool", () => {
    const box = lockupBox(LIGHTS.alone, STAGE_W, STAGE_H)
    const poolTop = (LIGHTS.alone.centreY - LIGHTS.alone.radiusY) * STAGE_H
    expect(box.top).toBeLessThan(poolTop - 120)
    expect(box.top).toBeGreaterThan(36)
    const beamX = LIGHTS.alone.centreX * STAGE_W
    expect(box.left + box.width / 2).toBeCloseTo(beamX, 0)
  })

  test("the prompt text is the script's, and it is not rendered", () => {
    expect(KEYBURSTS.plan.startsWith("Read the attached spec and the photo of Mia.")).toBe(true)
    expect(KEYBURSTS.plan.indexOf("Settings toggle and Automatic")).toBeGreaterThan(0)
    expect(KEYBURSTS.build.indexOf("feat/cat-mode")).toBeGreaterThan(0)
    expect(KEYBURSTS.pr).toBe(
      "Push feat/cat-mode and open a draft PR against main with gh. End with the PR URL.",
    )
    const rendered = timeline().copy.map((item) => ("title" in item ? item.title : "")).join(" ")
    expect(rendered).not.toContain("Read the attached spec")
  })
})

// --- Sound ------------------------------------------------------------------

describe("timeline / sound", () => {
  test("one ping per copy primitive, and none for the pop or the confetti", () => {
    const t = timeline()
    const pings = t.sounds.filter((sound) => sound.name === "ping")
    expect(pings.length).toBe(t.copy.length)
    for (const item of t.copy) {
      expect(pings.some((sound) => Math.abs(sound.at - item.at) < 1e-6)).toBe(true)
    }
    const celebration = t.celebrations[0]
    for (const sound of t.sounds) {
      if (sound.at < celebration.at - 1e-6 || sound.at > celebration.at + 1.5) {
        continue
      }
      // The pop and the confetti are silent: only the spotlight's own ping.
      expect(sound.name).toBe("ping")
      expect(sound.at).toBeLessThan(celebration.at)
    }
  })

  test("every recorded tap inside a shot is a ripple and a tap sound", () => {
    const t = timeline()
    expect(t.taps.length).toBeGreaterThan(0)
    expect(t.ripples.length).toBe(t.taps.length)
    expect(t.sounds.filter((sound) => sound.name === "tap").length).toBe(t.taps.length)
  })

  test("each ripple lands on the exact source frame of its tap", () => {
    const t = timeline()
    for (const item of capture.slices) {
      const inEdit = t.shots.filter((shot) => shot.slice === item.name)
      const drawn = (item.taps ?? []).filter((tap) =>
        inEdit.some(
          (shot) =>
            tap.atSec >= shot.startSec - 1e-6 &&
            tap.atSec <= shot.startSec + shot.duration * shot.rate + 1e-6,
        ),
      )
      expect(t.taps.filter((tap) => tap.slice === item.name).length).toBe(drawn.length)
    }
    for (const tap of t.taps) {
      expect(tap.x).toBeGreaterThanOrEqual(0)
      expect(tap.x).toBeLessThanOrEqual(1)
      expect(tap.y).toBeGreaterThanOrEqual(0)
      expect(tap.y).toBeLessThanOrEqual(1)
    }
  })

  test("every surviving keystroke sound lands on the exact character being drawn", () => {
    const t = timeline()
    const recorded: number[] = []
    for (const item of capture.slices) {
      for (const key of item.keys ?? []) {
        recorded.push(key.atSec)
      }
    }
    expect(recorded.length).toBe(696)
    const keySounds = t.sounds.filter((sound) => sound.name === "key")
    expect(keySounds.length).toBeGreaterThan(100)
    expect(keySounds.length).toBeLessThan(recorded.length)
    for (const sound of keySounds) {
      const drawn = drawnAt(t, sound.at)
      expect(recorded.some((atSec) => Math.abs(atSec - drawn) < 1e-6)).toBe(true)
    }
  })

  test("the key bed is thinned, never resampled", () => {
    const t = timeline()
    const keySounds = t.sounds.filter((sound) => sound.name === "key")
    expect(keySounds.length).toBeLessThan(t.keys.length)
    for (let index = 1; index < keySounds.length; index += 1) {
      expect(keySounds[index].at - keySounds[index - 1].at).toBeGreaterThan(0.15)
    }
  })

  test("no keystroke or tap is invented outside a recorded slice", () => {
    const t = timeline()
    const recorded = new Set(capture.slices.map((item) => item.name))
    for (const key of t.keys) {
      expect(recorded.has(key.slice)).toBe(true)
    }
    for (const tap of t.taps) {
      expect(recorded.has(tap.slice)).toBe(true)
    }
  })

  test("the bed never masks a tap", () => {
    // music.mp3 is -10.43 LUFS with a +0.80 dBTP peak; MUSIC_VOLUME lands it at
    // -26.3 LUFS, a measured 11 dB under a tap at 0.9.
    const bedDb = -10.43 + 20 * Math.log10(MUSIC_VOLUME)
    expect(bedDb).toBeGreaterThan(-27)
    expect(bedDb).toBeLessThan(-25)
    expect(-3.66 + 20 * Math.log10(0.9)).toBeLessThan(-4)
  })
})

// --- Pacing -----------------------------------------------------------------

describe("timeline / pacing", () => {
  test("every shot plays the capture at 1x", () => {
    for (const shot of timeline().shots) {
      expect(shot.rate).toBe(1)
      expect(shot.startSec).toBeGreaterThanOrEqual(0)
    }
  })

  test("a typing slice keeps every recorded key", () => {
    const t = timeline()
    for (const name of ["connect", "plan", "build", "pr"]) {
      const recorded = capture.slices.find((slice) => slice.name === name)
      if (recorded === undefined) {
        throw new Error(`no ${name} slice`)
      }
      const drawn = t.keys.filter((key) => key.slice === name)
      expect(drawn.length).toBe(recorded.keys?.length ?? 0)
    }
  })
})

// --- Celebration ------------------------------------------------------------

describe("timeline / celebration", () => {
  test("one pop and one confetti, both at the achievement", () => {
    const t = timeline()
    expect(t.celebrations.length).toBe(1)
    expect(t.confetti.length).toBe(1)
    const achievement = t.scenes[2]
    expect(t.celebrations[0].at).toBeCloseTo(achievement.from + 0.7, 9)
    expect(t.confetti[0].at).toBe(t.celebrations[0].at)
    expect(t.confetti[0].count).toBe(96)
    expect(t.confetti[0].at + t.confetti[0].hold).toBeLessThanOrEqual(achievement.to)
  })

  test("no celebration anywhere in the pr scene", () => {
    const t = timeline()
    const pr = t.scenes.find((scene) => scene.slug === "pr")
    if (pr === undefined) {
      throw new Error("no pr scene")
    }
    for (const celebration of t.celebrations) {
      expect(celebration.at < pr.from || celebration.at >= pr.to).toBe(true)
    }
    for (const burst of t.confetti) {
      expect(burst.at < pr.from || burst.at >= pr.to).toBe(true)
    }
  })

  test("the phone leaves with the outro slide", () => {
    const t = timeline()
    const outro = t.scenes[t.scenes.length - 1]
    expect(channel(t.phoneFade, outro.from - 0.01)).toBeCloseTo(1, 6)
    expect(channel(t.phoneFade, outro.from + 0.45)).toBe(0)
    expect(outro.slug).toBe("outro")
  })
})
