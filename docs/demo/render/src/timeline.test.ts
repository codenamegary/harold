import { describe, expect, test } from "bun:test"
import {
  BUILD_PROMPT,
  PLAN_PROMPT,
  PR_PROMPT,
  OUTRO_SEC,
  buildTimeline,
  channel,
  clipFrame,
  type CaptureSlice,
  type PhoneClip,
} from "./timeline"

const INTRO_SLICES = [
  "pair_idle",
  "pair_tap",
  "scanner_open",
  "scan_wait",
  "first_name",
  "first_confirm",
  "paired",
]

const STORY_SLICES = [
  "session_menu_open",
  "new_session",
  "workspace_open",
  "workspace_pick",
  "continue",
  "session_create_wait",
  "mode_plan",
  "prompt_focus",
  "prompt_type",
  "photo_open",
  "photo_pick",
  "photo_add",
  "file_open",
  "file_pick",
  "send",
  "plan_wait",
  "plan_reply",
  "elicitation_open",
  "elicitation_pick",
  "elicitation_submit",
  "mode_build",
  "build_prompt",
  "build_send",
  "build_wait",
  "build_reply",
  "usage",
  "changes_open",
  "changes_branch",
  "changes_file",
  "changes_back",
  "worktrees_open",
  "worktrees_close",
  "pr_prompt",
  "pr_send",
  "pr_wait",
  "pr_reply",
]

const BANNED_SLICES = [
  "pair_another_open",
  "pair_another_manual",
  "pair_another_details",
  "pair_another_claim",
  "pair_another_name",
  "pair_another_confirm",
  "pair_another_done",
  "session_see_all",
  "session_pick",
  "session_chat",
  "workspaces_open",
  "add_workspace_open",
  "session_menu_reopen",
  "model_open",
  "model_search",
  "model_pick",
  "effort_1",
  "effort_2",
  "effort_3",
  "slash_open",
  "slash_close",
  "reply_wait",
  "reply",
  "voice_open",
  "voice_expand",
  "voice_transcript",
  "voice_send",
  "voice_reply_wait",
  "voice_reply",
]

const WAIT_SLICES = new Set(["plan_wait", "build_wait", "pr_wait"])

// A slice-name helper: tests name the shot, never the file number. The durations
// are generous so authored in-points and rates fit the synthetic source.
const slice = (name: string, durationSec?: number): CaptureSlice => ({
  name,
  file: `slices/${name}.mp4`,
  durationSec: sliceDuration(name, durationSec),
  width: 1080,
  height: 2400,
  taps: [
    { x: 540, y: 1200, atSec: 2 },
    { x: 540, y: 1600, atSec: 2.4 },
  ],
})

const sliceDuration = (name: string, durationSec?: number): number => {
  if (durationSec !== undefined) {
    return durationSec
  }
  if (WAIT_SLICES.has(name)) {
    return 30
  }
  if (name === "usage") {
    return 3.2
  }
  return 8
}

const captureSlices = (overrides: Record<string, number> = {}): CaptureSlice[] => [
  ...INTRO_SLICES.map((name) => slice(name)),
  ...STORY_SLICES.map((name) => slice(name, overrides[name])),
]

const timeline = buildTimeline(captureSlices())

const recordedCapture = (await Bun.file(
  new URL("../public/capture.json", import.meta.url),
).json()) as {
  slices: CaptureSlice[]
}
const recordedTimeline = buildTimeline(recordedCapture.slices)

const sliceName = (file: string) =>
  file
    .replace(/^.*\//, "")
    .replace(/^\d+-/, "")
    .replace(/\.mp4$/, "")

const shot = (name: string) => {
  const clip = timeline.clips.find(
    (candidate) => candidate.kind === "play" && sliceName(candidate.file) === name,
  )
  if (clip?.kind !== "play") {
    throw new Error(`no play clip for ${name}`)
  }
  return clip
}

const playClips = () => timeline.clips.filter((clip) => clip.kind === "play")

const storyClips = () => {
  const first = shot("session_menu_open")
  return playClips().filter((clip) => clip.from >= first.from)
}

const storyNames = () => storyClips().map((clip) => sliceName(clip.file))

const keysBetween = (from: number, to: number) =>
  timeline.sounds.filter(
    (sound) => sound.name === "key" && sound.at >= from && sound.at <= to + 0.001,
  )

describe("clipFrame", () => {
  test("maps render time onto the captured source from its in-point", () => {
    const clip: PhoneClip = {
      kind: "play",
      file: "slice.mp4",
      from: 10,
      duration: 2,
      rate: 2,
      startSec: 3.5,
    }

    expect(clipFrame(clip, 10)).toBe(3.5)
    expect(clipFrame(clip, 11)).toBe(5.5)
  })
})

describe("story order", () => {
  test("keeps the achievement spoilered and unchanged", () => {
    const spotlight = timeline.spotlights.find((entry) => entry.title === "Work from Couch")

    expect(spotlight).toBeDefined()
    expect(spotlight?.kicker).toBe("Achievement unlocked")
    expect(spotlight?.side).toBe("left")
    expect(spotlight?.hold).toBeGreaterThanOrEqual(3)
    expect(timeline.captions.some((caption) => caption.text.includes("Achievement"))).toBe(false)
    expect(timeline.celebrations).toHaveLength(1)
    expect(timeline.celebrations[0].confetti).toBe(true)
  })

  test("starts the story with the session menu after the achievement", () => {
    expect(storyNames()[0]).toBe("session_menu_open")
    expect(shot("session_menu_open").from).toBeCloseTo(27.8, 5)
  })

  test("walks new session, plan, attachments, question, build, usage, changes, worktrees, PR", () => {
    expect(storyNames()).toEqual(STORY_SLICES)
  })

  test("does not use the removed feature-tour slices", () => {
    const used = new Set(playClips().map((clip) => sliceName(clip.file)))
    for (const banned of BANNED_SLICES) {
      expect(used.has(banned)).toBe(false)
    }
    expect(used.has("session_see_all")).toBe(false)
    expect(used.has("workspaces_open")).toBe(false)
    expect(used.has("model_open")).toBe(false)
  })

  test("ends at about two minutes", () => {
    expect(timeline.endSec).toBeGreaterThan(112)
    expect(timeline.endSec).toBeLessThan(122)
    expect(timeline.endSec + OUTRO_SEC).toBeLessThan(125)
  })
})

describe("phone stage", () => {
  test("keeps the first pairing close-up and the story start", () => {
    expect(channel(timeline.phoneStage.width, 15.0)).toBeCloseTo(380, 5)
    expect(channel(timeline.phoneStage.top, 15.0)).toBeCloseTo(108, 5)
    expect(channel(timeline.phoneStage.width, 15.5)).toBeCloseTo(760, 5)
    expect(channel(timeline.phoneStage.top, 15.5)).toBeCloseTo(0, 5)
    expect(channel(timeline.phoneStage.centerX, 18.5)).toBeCloseTo(1460, 5)
    expect(channel(timeline.phoneStage.top, 20.7)).toBeCloseTo(0, 5)
    expect(channel(timeline.phoneStage.top, 22.8)).toBeCloseTo(-314.5, 5)
    expect(channel(timeline.phoneStage.centerX, 27.8)).toBeCloseTo(960, 5)
    expect(channel(timeline.phoneStage.width, 27.8)).toBeCloseTo(450, 5)
  })

  test("enlarges on the new session form and pulls back after Continue", () => {
    const newSession = shot("new_session")
    const workspace = shot("workspace_open")
    const continued = shot("continue")
    const zoomedAt = newSession.from + newSession.duration

    expect(channel(timeline.phoneStage.width, zoomedAt + 0.6)).toBeCloseTo(760, 5)
    expect(channel(timeline.phoneStage.centerX, zoomedAt + 0.6)).toBeCloseTo(1460, 5)
    expect(channel(timeline.phoneStage.top, zoomedAt + 0.6)).toBeCloseTo(-314.5, 5)
    expect(channel(timeline.phoneStage.width, workspace.from + 0.5)).toBeCloseTo(760, 5)
    expect(
      channel(timeline.phoneStage.width, continued.from + continued.duration + 0.9),
    ).toBeCloseTo(450, 5)
    expect(
      channel(timeline.phoneStage.centerX, continued.from + continued.duration + 0.9),
    ).toBeCloseTo(960, 5)
  })

  test("docks the phone right for the final spotlight", () => {
    const prReply = shot("pr_reply")
    const dockedAt = prReply.from + 1.0 + 0.5

    expect(channel(timeline.phoneStage.width, dockedAt)).toBeCloseTo(760, 5)
    expect(channel(timeline.phoneStage.centerX, dockedAt)).toBeCloseTo(1460, 5)
    expect(channel(timeline.phoneStage.top, dockedAt)).toBeCloseTo(-314.5, 5)
  })
})

describe("locked captions", () => {
  test("notes the new session", () => {
    const note = timeline.notes.find((entry) => entry.title === "Start something new")

    expect(note).toBeDefined()
    expect(note?.label).toBe("NEW SESSION")
  })

  test("callouts the plan mode chip", () => {
    const callout = timeline.callouts.find((entry) => entry.title === "Use your agent’s plan mode")

    expect(callout).toBeDefined()
    expect(callout?.eyebrow).toBe("PLAN")
  })

  test("callouts the attachments with the exact copy", () => {
    const callout = timeline.callouts.find((entry) => entry.title === "Give it the spec")

    expect(callout).toBeDefined()
    expect(callout?.eyebrow).toBe("ATTACHMENTS")
    expect(callout?.hint).toBe("A markdown file and a photo of Mia.")
  })

  test("callouts the question card with the exact copy", () => {
    const callout = timeline.callouts.find((entry) => entry.title === "Get grilled")

    expect(callout).toBeDefined()
    expect(callout?.eyebrow).toBe("AGENT QUESTION")
    expect(callout?.hint).toBe("Interactive question tooling.")
  })

  test("callouts build mode", () => {
    const callout = timeline.callouts.find((entry) => entry.title === "Execute the plan")

    expect(callout).toBeDefined()
    expect(callout?.eyebrow).toBe("BUILD")
  })

  test("callouts usage and zooms to the header", () => {
    const callout = timeline.callouts.find((entry) => entry.title === "Know what it cost")
    const usage = shot("usage")

    expect(callout).toBeDefined()
    expect(callout?.eyebrow).toBe("USAGE")
    expect(callout?.hint).toBe("Tokens and dollars, in the header.")
    expect(channel(timeline.zoom.scale, usage.from + 0.7)).toBeGreaterThan(2)
    expect(channel(timeline.zoom.y, usage.from + 0.7)).toBeCloseTo(0.08, 2)
  })

  test("callouts changes and the diff", () => {
    const review = timeline.callouts.find((entry) => entry.title === "Review the code")
    const diff = timeline.callouts.find((entry) => entry.title === "Pretty diffs!")

    expect(review?.eyebrow).toBe("CHANGES")
    expect(diff?.eyebrow).toBe("CHANGES")
  })

  test("callouts the worktree sheet with the exact copy", () => {
    const callout = timeline.callouts.find((entry) => entry.title === "Auto-detect, or choose")

    expect(callout).toBeDefined()
    expect(callout?.eyebrow).toBe("WORKTREES")
    expect(callout?.hint).toBe("Pick the worktree to inspect.")
  })

  test("callouts the draft PR", () => {
    const callout = timeline.callouts.find((entry) => entry.title === "Just like always")

    expect(callout).toBeDefined()
    expect(callout?.eyebrow).toBe("DRAFT PR")
    expect(callout?.hint).toBe("The agent pushes and opens it.")
  })

  test("ends on the final spotlight", () => {
    const spotlight = timeline.spotlights.find((entry) => entry.title === "From plan to PR")

    expect(spotlight).toBeDefined()
    expect(spotlight?.kicker).toBe("The whole loop")
    expect(spotlight?.side).toBe("left")
  })
})

describe("recorded capture", () => {
  const recordedClip = (name: string) => {
    const clip = recordedTimeline.clips.find((candidate) => sliceName(candidate.file) === name)
    if (clip === undefined) {
      throw new Error(`the committed capture has no clip for ${name}`)
    }
    return clip
  }
  const recordedKeys = (name: string) => {
    const clip = recordedClip(name)
    return recordedTimeline.sounds.filter(
      (sound) =>
        sound.name === "key" &&
        sound.at >= clip.from &&
        sound.at <= clip.from + clip.duration + 0.001,
    )
  }

  test("builds the whole cut from the committed slices", () => {
    expect(recordedCapture.slices).toHaveLength(43)
    expect(recordedTimeline.endSec).toBeGreaterThan(112)
    expect(recordedTimeline.endSec).toBeLessThan(122)
    expect(recordedTimeline.endSec + OUTRO_SEC).toBeLessThan(125)
  })

  test("names the first story slice and keeps the final spotlight", () => {
    const story = recordedTimeline.clips
      .filter((clip) => clip.from >= recordedClip("session_menu_open").from)
      .map((clip) => ({ name: sliceName(clip.file), from: clip.from }))
      .sort((a, b) => a.from - b.from)

    expect(story[0].name).toBe("session_menu_open")
    expect(
      recordedTimeline.spotlights.find((entry) => entry.title === "From plan to PR"),
    ).toBeDefined()
  })

  test("types the full prompts from the recorded slices", () => {
    expect(recordedKeys("prompt_type")).toHaveLength(PLAN_PROMPT.length)
    expect(recordedKeys("build_prompt")).toHaveLength(BUILD_PROMPT.length)
    expect(recordedKeys("pr_send")).toHaveLength(PR_PROMPT.length)
  })

  test("holds the usage shot for three seconds", () => {
    const usage = recordedTimeline.clips.filter((clip) => sliceName(clip.file) === "usage")
    const start = usage[0].from
    const end = usage[usage.length - 1].from + usage[usage.length - 1].duration
    expect(end - start).toBeGreaterThanOrEqual(3)
  })
})

describe("phone typing", () => {
  test("types the full plan prompt inside its shot", () => {
    const clip = shot("prompt_type")
    const keys = keysBetween(clip.from, clip.from + clip.duration)

    expect(keys).toHaveLength(PLAN_PROMPT.length)
    expect(clip.startSec).toBe(0.2)
  })

  test("types the full build prompt inside its shot", () => {
    const clip = shot("build_prompt")
    const keys = keysBetween(clip.from, clip.from + clip.duration)

    expect(keys).toHaveLength(BUILD_PROMPT.length)
  })

  test("types the full PR prompt inside its shot", () => {
    const clip = shot("pr_send")
    const keys = keysBetween(clip.from, clip.from + clip.duration)

    expect(keys).toHaveLength(PR_PROMPT.length)
  })

  test("keeps the identity name typing", () => {
    const first = shot("first_name")
    expect(keysBetween(first.from, first.from + first.duration)).toHaveLength("Work".length)
  })
})

describe("terminal", () => {
  test("prints the waiting line and the paired line", () => {
    const text = timeline.terminal
      .flatMap((item) => (item.kind === "output" ? item.segs.map((seg) => seg.text) : []))
      .join("\n")

    expect(text).toContain("Waiting for a device to claim...")
    expect(text).not.toContain("Waiting for a device to scan...")
    expect(text).toContain("Device paired.")
  })
})
