import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { REST, poseAt, waddleAt, type BodyCue } from "./body"
import { PHONE_FIT, PRESETS, phoneLayout, type CameraState } from "./camera"
import { LIGHTS, PARALLAX, lightAt, type LightState } from "./stage"
import {
  CELEBRATION_AT,
  DURATION_IN_FRAMES,
  DURATION_SEC,
  EDIT_SLICES,
  FPS,
  KEYBURSTS,
  MUSIC_VOLUME,
  SCENES,
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
  phoneFade,
  sceneFrames,
  spotlights,
  type CaptureSlice,
  type SceneSlug,
  type Shot,
  type Timeline,
} from "./timeline"
import { CTA_HANDLE, SITE, SUBTITLE } from "./slides"

const capture = JSON.parse(
  readFileSync(new URL("../public/capture.json", import.meta.url), "utf8"),
) as { width: number; height: number; slices: CaptureSlice[] }

const REAL_SLICES = [
  "connect_empty",
  "connect_key",
  "connect_fill",
  "connect_test",
  "connect_trust",
  "connect_save",
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

/** On-screen characters a second for a shot's own real typing window. */
const onScreenCps = (shot: Shot, sample = 12): number => {
  const drawnTo = shot.startSec + shot.duration * shot.rate
  const keys = (shot.data.keys ?? [])
    .map((key) => key.atSec)
    .filter((atSec) => atSec >= shot.startSec && atSec <= drawnTo)
    .sort((a, b) => a - b)
  const first = keys.slice(0, sample)
  if (first.length < 2) {
    throw new Error(`shot at ${shot.at} draws no typing`)
  }
  const renderSpan = (first[first.length - 1] - first[0]) / shot.rate
  return (first.length - 1) / renderSpan
}

const frame = (sec: number): number => Math.round(sec * FPS)

// --- Capture contract -------------------------------------------------------

describe("timeline / capture contract", () => {
  test("the edit uses every captured slice, in capture order", () => {
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
      const drawnTo = shot.startSec + shot.duration * shot.rate
      expect(drawnTo).toBeLessThanOrEqual(shot.data.durationSec + 1e-6)
      expect(shot.data.file.startsWith("slices/")).toBe(true)
      expect(shot.duration * FPS).toBeGreaterThan(2)
    }
  })

  test("each scene plays the footage its beats name", () => {
    const t = timeline()
    const byScene = (scene: SceneSlug): string[] => shotsOf(t, scene).map((shot) => shot.slice)
    expect(byScene("intro")).toEqual([])
    expect(byScene("ssh")).toEqual([
      "connect_empty",
      "connect_key",
      "connect_fill",
      "connect_fill",
      "connect_test",
      "connect_test",
      "connect_trust",
      "connect_save",
      "landing",
    ])
    expect(byScene("achievement")).toEqual(["landing"])
    expect(byScene("newSession")).toEqual(["new_session", "new_session", "new_session"])
    expect(byScene("plan")).toEqual(["plan", "plan", "plan", "plan"])
    expect(byScene("question")).toEqual(["question", "question", "question"])
    expect(byScene("build")).toEqual(["build", "build", "build", "build", "build"])
    expect(byScene("usage")).toEqual(["usage"])
    expect(byScene("changes")).toEqual([
      "changes",
      "changes",
      "changes",
      "changes",
      "changes",
      "changes",
    ])
    expect(byScene("worktrees")).toEqual(["worktrees", "worktrees"])
    expect(byScene("pr")).toEqual(["pr", "pr", "pr", "pr", "pr"])
    expect(byScene("outro")).toEqual([])
  })

  test("the achievement picks the landing recording up where the SSH left it", () => {
    const t = timeline()
    const sshLast = shotsOf(t, "ssh")[shotsOf(t, "ssh").length - 1]
    const hinge = shotsOf(t, "achievement")[0]
    const leftAt = sshLast.startSec + sshLast.duration * sshLast.rate
    expect(leftAt).toBeCloseTo(hinge.startSec, 6)
    expect(hinge.slice).toBe("landing")
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
    expect(SCENES.length).toBe(12)
    expect(SCENES[2].slug).toBe("achievement")
  })

  test("the duration is the sum of the scene budget, between 110 and 125 s", () => {
    const frames = SCENES.map((scene) => scene.frames)
    expect(frames).toEqual([105, 600, 225, 180, 420, 180, 450, 150, 360, 105, 465, 150])
    expect(frames.reduce((sum, value) => sum + value, 0)).toBe(DURATION_IN_FRAMES)
    expect(DURATION_IN_FRAMES).toBe(3390)
    expect(DURATION_SEC).toBeCloseTo(113, 10)
    expect(DURATION_SEC).toBeGreaterThanOrEqual(110)
    expect(DURATION_SEC).toBeLessThanOrEqual(125)
    expect(buildTimeline(capture.slices).endSec).toBe(DURATION_SEC)
  })

  test("the scenes tile the timeline with no gap, on whole frames", () => {
    expect(SCENES[0].from).toBe(0)
    SCENES.forEach((scene, index) => {
      if (index > 0) {
        expect(scene.from).toBeCloseTo(SCENES[index - 1].to, 9)
      }
      expect(Math.abs(scene.from * FPS - Math.round(scene.from * FPS))).toBeLessThan(1e-9)
      expect(sceneFrames(scene.slug)).toBe(scene.frames)
    })
    expect(SCENES[SCENES.length - 1].to).toBe(DURATION_SEC)
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
    expect(SCENES.map((scene) => [scene.slug, scene.light]) as [SceneSlug, LightState][]).toEqual(
      expected,
    )
    const t = timeline()
    for (const scene of SCENES) {
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
    const outro = SCENES[SCENES.length - 1]
    expect(outro.light).toBe("alone")
  })

  test("a light transition is smooth and then holds", () => {
    const t = timeline()
    const arrival = t.lights[1].at
    const before = lightAt(t.lights, arrival - 0.001)
    const middle = lightAt(t.lights, arrival + 0.6)
    const after = lightAt(t.lights, arrival + 1.2)
    expect(before.state).toBe("alone")
    expect(middle.state).toBe("arrival")
    expect(middle.shape.intensity).toBeGreaterThan(before.shape.intensity)
    expect(middle.shape.intensity).toBeLessThan(after.shape.intensity)
    expect(after.shape).toEqual(LIGHTS.arrival)
    // It holds until the next cue, which is the achievement.
    expect(lightAt(t.lights, t.lights[2].at - 0.01).shape).toEqual(LIGHTS.arrival)
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

  test("the achievement uses the two-column layout and pushes in, docked right", () => {
    const t = timeline()
    const achievement = t.scenes[2]
    expect(achievement.layout).toBe("L2C")
    const state = t.cameraAt(achievement.from + 0.5)
    expect(state.preset).toBe("center-two-thirds")
    expect(state.scale).toBe(2)
    expect(state.dock).toBeGreaterThan(0.6)
    // The phone has to clear the spotlight column on the left.
    const layout = phoneLayout(state, VIDEO_W, VIDEO_H, STAGE_W, STAGE_H, { x: 0, y: 0 })
    expect(layout.left).toBeGreaterThan(96 + 640)
  })

  test("the usage scene honours the script's zoom exactly", () => {
    const t = timeline()
    const usage = t.scenes.find((scene) => scene.slug === "usage")
    if (usage === undefined) {
      throw new Error("no usage scene")
    }
    const state = t.cameraAt(usage.from + 0.2)
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
    const wide = t.cameraAt(newSession.from + 1)
    const form = t.cameraAt(newSession.from + 2.5)
    const back = t.cameraAt(newSession.from + 5)
    expect(wide.preset).toBe("full")
    expect(form.preset).toBe("center-two-thirds")
    expect(back.preset).toBe("full")
    // No state changes inside a held window.
    expect(t.cameraAt(newSession.from + 1.5)).toEqual(wide)
    expect(t.cameraAt(newSession.from + 3)).toEqual(form)
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
    for (const scene of SCENES) {
      expect(Math.abs(scene.drift)).toBeGreaterThanOrEqual(1)
      expect(Math.abs(scene.drift)).toBeLessThanOrEqual(2)
    }
  })

  test("the drift accumulator restarts on every cut", () => {
    const t = timeline()
    const shot = shotsOf(t, "plan")[1]
    expect(driftAt(t.scenes, t.shots, shot.at, STAGE_W).x).toBeCloseTo(0, 6)
    const later = driftAt(t.scenes, t.shots, shot.at + 2, STAGE_W).x
    const expected = (t.scenes[4].drift / 100) * STAGE_W * 2
    expect(later).toBeCloseTo(expected, 6)
    // The pool and the haze are offset from the same drift at different factors.
    expect(later * PARALLAX.pool).not.toBeCloseTo(later, 3)
    expect(later * PARALLAX.haze).not.toBeCloseTo(later, 3)
  })
})

// --- Body language ----------------------------------------------------------

describe("timeline / the phone as a character", () => {
  test("the SSH scene is the only waddle, and it starts on the cut", () => {
    const t = timeline()
    expect(t.waddles.length).toBe(1)
    const ssh = t.scenes[1]
    expect(t.waddles[0].at).toBeCloseTo(ssh.from, 6)
    expect(t.waddles[0].duration).toBeGreaterThan(1)
  })

  test("the waddle rings down to nothing", () => {
    const waddle = { at: 0, duration: 1.5 }
    expect(waddleAt(waddle, -0.1)).toEqual(REST)
    expect(waddleAt(waddle, 1.6)).toEqual(REST)
    expect(Math.abs(waddleAt(waddle, 0.2).rotateZ)).toBeGreaterThan(0)
    const early = Math.abs(waddleAt(waddle, 0.2).rotateZ)
    const late = Math.abs(waddleAt(waddle, 1.3).rotateZ)
    expect(early).toBeGreaterThan(late)
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
    const presented = poseAt(t.bodies, changes.from + 1.2)
    expect(turning.rotateY).toBeLessThan(-5)
    expect(Math.abs(presented.rotateY)).toBeLessThan(1)
  })

  test("a held pose is still animated by the sway", () => {
    const cues: BodyCue[] = [{ at: 0, pose: { ...REST } }]
    expect(poseAt(cues, 4)).toEqual(REST)
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
      "CARD Harold over SSH to your agent hosts [stage]",
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
    // The capture ships taps only up to connect_save, so every callout in the
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
    expect(t.taps.length).toBe(4)
    expect(t.ripples.length).toBe(4)
    expect(t.sounds.filter((sound) => sound.name === "tap").length).toBe(4)
    expect(t.taps.map((tap) => tap.slice)).toEqual([
      "connect_fill",
      "connect_test",
      "connect_trust",
      "connect_save",
    ])
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
  test("the question slice plays at real speed", () => {
    const t = timeline()
    const question = shotsOf(t, "question")
    expect(question.length).toBe(3)
    for (const shot of question) {
      expect(shot.rate).toBe(1)
    }
    expect(question[0].startSec).toBeCloseTo(1.15, 6)
    const last = question[question.length - 1]
    expect(last.startSec + last.duration).toBeCloseTo(5.45, 6)
  })

  test("no short slice is stretched into slow motion", () => {
    for (const shot of timeline().shots) {
      expect(shot.rate).toBeGreaterThanOrEqual(0.5)
    }
  })

  test("the long prompts play a real window at six to eight characters a second", () => {
    const t = timeline()
    const fill = shotsOf(t, "ssh").find((shot) => shot.slice === "connect_fill")
    if (fill === undefined) {
      throw new Error("no fill shot")
    }
    const plan = shotsOf(t, "plan")[0]
    const build = shotsOf(t, "build")[0]
    const pr = shotsOf(t, "pr")[0]
    for (const shot of [fill, plan, build, pr]) {
      expect(shot.rate).toBeLessThan(1)
      const cps = onScreenCps(shot)
      expect(cps).toBeGreaterThan(6)
      expect(cps).toBeLessThan(8)
    }
  })

  test("the long prompts are cut ahead, not slowed to fit", () => {
    const t = timeline()
    const plan = shotsOf(t, "plan")
    const build = shotsOf(t, "build")
    const planChars = t.keys.filter((key) =>
      plan.some((shot) => key.at >= shot.at - 1e-9 && key.at < shot.until - 1e-9),
    ).length
    const buildChars = t.keys.filter((key) =>
      build.some((shot) => key.at >= shot.at - 1e-9 && key.at < shot.until - 1e-9),
    ).length
    expect(planChars).toBeLessThan(KEYBURSTS.plan.length / 2)
    expect(buildChars).toBeLessThan(KEYBURSTS.build.length / 2)
    expect(planChars).toBeGreaterThan(40)
    expect(buildChars).toBeGreaterThan(40)
    expect(plan.length).toBe(4)
    expect(build.length).toBe(5)
  })
})

// --- Celebration ------------------------------------------------------------

describe("timeline / celebration", () => {
  test("one pop and one confetti, both at the achievement", () => {
    const t = timeline()
    expect(t.celebrations.length).toBe(1)
    expect(t.confetti.length).toBe(1)
    const achievement = t.scenes[2]
    expect(t.celebrations[0].at).toBeCloseTo(CELEBRATION_AT, 9)
    expect(CELEBRATION_AT).toBeCloseTo(achievement.from + 0.6, 9)
    expect(frame(CELEBRATION_AT)).toBe(723)
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
    const outro = SCENES[SCENES.length - 1]
    expect(channel(phoneFade, outro.from - 0.01)).toBeCloseTo(1, 6)
    expect(channel(phoneFade, outro.from + 0.45)).toBe(0)
    expect(outro.slug).toBe("outro")
  })
})
