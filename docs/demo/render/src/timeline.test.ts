import { describe, expect, test } from "bun:test"
import {
  BUILD_PROMPT,
  PLAN_PROMPT,
  PR_PROMPT,
  buildTimeline,
  channel,
  type CaptureSlice,
} from "./timeline"
import { FINGERPRINT, SSH_ENDPOINT } from "./terminal-data"

const SETUP_SLICES = [
  "home_idle",
  "add_host_tap",
  "setup_top",
  "setup_host",
  "setup_auth",
  "setup_password",
  "setup_test",
  "setup_trust",
  "connected",
]

const STORY_SLICES = [
  "session_menu_open",
  "new_session",
  "workspace_open",
  "workspace_pick",
  "agent_open",
  "agent_pick",
  "start_session",
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

const WAIT_SLICES = new Set(["plan_wait", "build_wait", "pr_wait"])

const slice = (name: string, durationSec?: number): CaptureSlice => ({
  name,
  file: `slices/${name}.mp4`,
  durationSec: durationSec ?? (WAIT_SLICES.has(name) ? 40 : name === "setup_host" ? 30 : 4),
  width: 1080,
  height: 2400,
  taps: [{ x: 540, y: 1200, atSec: 1.2 }],
})

const CAPTURE = [...SETUP_SLICES, ...STORY_SLICES].map((name) => slice(name))

describe("timeline", () => {
  test("builds every required slice", () => {
    const timeline = buildTimeline(CAPTURE)
    expect(timeline.clips.length).toBeGreaterThan(0)
    expect(timeline.endSec).toBeGreaterThan(60)
  })

  test("starts on the SSH host and the home screen", () => {
    const timeline = buildTimeline(CAPTURE)
    const firstSetup = timeline.clips[0]
    expect(firstSetup?.file).toContain("home_idle")
    const transcript = JSON.stringify(timeline.terminal)
    expect(transcript).toContain("gary@127.0.0.1")
    expect(transcript).toContain("2223")
    expect(transcript).toContain(FINGERPRINT)
  })

  test("moves from setup into the session menu", () => {
    const timeline = buildTimeline(CAPTURE)
    const names = timeline.clips.map((clip) => clip.file)
    expect(names.some((name) => name.includes("session_menu_open"))).toBe(true)
    expect(names.some((name) => name.includes("setup_trust"))).toBe(true)
  })

  test("enlarges on the new session form and pulls back after Start Session", () => {
    const timeline = buildTimeline(CAPTURE)
    const newSession = timeline.clips.find((clip) => clip.file.includes("new_session"))
    const start = timeline.clips.find((clip) => clip.file.includes("start_session"))
    expect(newSession).toBeDefined()
    expect(start).toBeDefined()
    if (newSession === undefined || start === undefined) return
    expect(channel(timeline.phoneStage.width, newSession.from + 1)).toBeGreaterThan(500)
    expect(channel(timeline.phoneStage.width, start.from + 2)).toBeLessThan(600)
  })

  test("keeps the plan, question, build, usage, changes, worktrees, and PR beats", () => {
    const timeline = buildTimeline(CAPTURE)
    expect(timeline.annotations.some((item) => item.title === "Plan it first")).toBe(true)
    expect(timeline.callouts.some((item) => item.title === "Get grilled")).toBe(true)
    expect(timeline.callouts.some((item) => item.title === "Know what it cost")).toBe(true)
    expect(timeline.callouts.some((item) => item.title === "Review the code")).toBe(true)
    expect(timeline.callouts.some((item) => item.title === "Auto-detect, or choose")).toBe(true)
    expect(timeline.callouts.some((item) => item.title === "Just like always")).toBe(true)
    expect(timeline.spotlights.some((item) => item.title === "From plan to PR")).toBe(true)
    expect(timeline.spotlights.some((item) => item.title === "Your host, your agents")).toBe(true)
  })

  test("types the prompts inside their recorded windows", () => {
    const timeline = buildTimeline(CAPTURE)
    const typed = timeline.sounds.filter((sound) => sound.name === "key").length
    expect(typed).toBeGreaterThan(PLAN_PROMPT.length + BUILD_PROMPT.length + PR_PROMPT.length)
  })

  test("keeps the fixed demo endpoint and host key in the terminal copy", () => {
    expect(SSH_ENDPOINT).toBe("gary@127.0.0.1:2223")
    expect(FINGERPRINT.startsWith("SHA256:")).toBe(true)
  })
})
