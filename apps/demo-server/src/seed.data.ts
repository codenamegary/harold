import { FILE_MODE_EXECUTABLE, VfsStore } from "./vfs.store"
import { VirtualRepoConfig } from "./git.virtual"

export type SeededAgentConfig = {
  id: string
  displayName: string | null
  path: string
  args: ReadonlyArray<string>
  binDir: string | null
  enabled: boolean
  dismissed: boolean
  custom: boolean
  present: boolean
  updatedAt: string
}

export type SeededWorkspace = {
  id: string
  name: string
  path: string
  createdAt: string
  lastUsedAt: string
}

export type SeededMessage = {
  role: "user" | "assistant"
  text: string
}

export type SeededSession = {
  sessionId: string
  cwd: string
  title: string
  updatedAt: string
  turnIndex: number
  history: ReadonlyArray<SeededMessage>
  usage?: {
    used: number
    size: number
    cost: { amount: number; currency: string }
  }
}

export const DEMO_HOME = "/home/demo"
export const CAT_WORKTREE_ROOT = `${DEMO_HOME}/sites/cat-screensaver-worktrees/cat-mode`

export const AGENT_NAMES: Record<string, string> = {
  opencode: "OpenCode",
  "claude-acp": "Claude Agent",
  "codex-acp": "Codex",
  cursor: "Cursor",
  gemini: "Gemini CLI",
}

export const AGENT_BINARIES: Record<string, string> = {
  opencode: "/usr/local/bin/opencode",
  "claude-acp": "/usr/local/bin/claude",
  "codex-acp": "/usr/local/bin/codex-acp",
  cursor: "/usr/local/bin/cursor-agent",
  gemini: "/usr/local/bin/gemini",
}

const INITIAL_SETTINGS_JS = `const STORAGE_KEY = "cat-screensaver.settings"

export const DEFAULT_SETTINGS = Object.freeze({
  speed: 1,
  showClock: true,
})

export const SETTINGS_CONTROLS = Object.freeze([
  { key: "speed", label: "Speed", type: "range", min: 0.5, max: 2, step: 0.5 },
  { key: "showClock", label: "Show clock", type: "toggle" },
])

export const setSetting = (settings, key, value) => ({ ...settings, [key]: value })
`

const INITIAL_MAIN_JS = `import { DEFAULT_SETTINGS } from "./settings.js"

export const renderFrame = (ctx, settings = DEFAULT_SETTINGS) => {
  ctx.fillStyle = "#070b12"
  ctx.fillRect(0, 0, 800, 600)
  return settings.showClock
}
`

export const UPDATED_SETTINGS_JS = `const STORAGE_KEY = "cat-screensaver.settings"

export const DEFAULT_SETTINGS = Object.freeze({
  speed: 1,
  showClock: true,
  catMode: true,
})

export const SETTINGS_CONTROLS = Object.freeze([
  { key: "speed", label: "Speed", type: "range", min: 0.5, max: 2, step: 0.5 },
  { key: "showClock", label: "Show clock", type: "toggle" },
  { key: "catMode", label: "Cat mode", type: "toggle" },
])

export const setSetting = (settings, key, value) => ({ ...settings, [key]: value })
`

export const NEW_CAT_MODE_JS = `export const createCat = (name = "Mia") => ({
  name,
  x: 120,
  y: 240,
  vx: 1.4,
})

export const stepCat = (cat, width = 800) => {
  const nextX = (cat.x + cat.vx) % width
  return { ...cat, x: nextX }
}
`

export const NEW_CAT_MODE_TEST_JS = `import assert from "node:assert/strict"
import { createCat, stepCat } from "../src/cat-mode.js"

const mia = createCat("Mia")
const moved = stepCat(mia, 800)
assert.equal(moved.x > mia.x, true)
`

export const seedVfsAndRepos = (vfs: VfsStore): ReadonlyArray<VirtualRepoConfig> => {
  const now = "2026-11-09T22:30:00Z"

  const workspaces: ReadonlyArray<SeededWorkspace> = [
    {
      id: "ws_cat_screensaver",
      name: "cat-screensaver",
      path: CAT_WORKTREE_ROOT,
      createdAt: "2026-11-09T22:42:00Z",
      lastUsedAt: "2026-11-09T23:30:00Z",
    },
    {
      id: "ws_moonlit_garden",
      name: "moonlit-garden",
      path: `${DEMO_HOME}/sites/moonlit-garden`,
      createdAt: "2026-11-09T22:40:00Z",
      lastUsedAt: "2026-11-09T23:20:00Z",
    },
    {
      id: "ws_meow",
      name: "meow",
      path: `${DEMO_HOME}/sites/meow`,
      createdAt: "2026-11-09T22:41:00Z",
      lastUsedAt: "2026-11-09T23:10:00Z",
    },
    {
      id: "ws_fish_screensaver",
      name: "fish-screensaver-for-cats",
      path: `${DEMO_HOME}/sites/fish-screensaver-for-cats`,
      createdAt: "2026-11-09T22:43:00Z",
      lastUsedAt: "2026-11-09T23:00:00Z",
    },
  ]

  const agents: ReadonlyArray<SeededAgentConfig> = [
    {
      id: "opencode",
      displayName: null,
      path: "/usr/local/bin/opencode",
      args: ["acp"],
      binDir: null,
      enabled: true,
      dismissed: false,
      custom: false,
      present: true,
      updatedAt: now,
    },
    {
      id: "claude-acp",
      displayName: null,
      path: "/usr/local/bin/claude",
      args: ["acp"],
      binDir: null,
      enabled: true,
      dismissed: false,
      custom: false,
      present: true,
      updatedAt: now,
    },
    {
      id: "codex-acp",
      displayName: null,
      path: "/usr/local/bin/codex-acp",
      args: [],
      binDir: null,
      enabled: true,
      dismissed: false,
      custom: false,
      present: true,
      updatedAt: now,
    },
    {
      id: "cursor",
      displayName: null,
      path: "/usr/local/bin/cursor-agent",
      args: ["acp"],
      binDir: null,
      enabled: true,
      dismissed: false,
      custom: false,
      present: true,
      updatedAt: now,
    },
    {
      id: "gemini",
      displayName: null,
      path: "/usr/local/bin/gemini",
      args: ["acp"],
      binDir: null,
      enabled: true,
      dismissed: false,
      custom: false,
      present: true,
      updatedAt: now,
    },
  ]

  vfs.mkdir(`${DEMO_HOME}/.harold`, { recursive: true })
  vfs.writeFile(
    `${DEMO_HOME}/.harold/workspaces.json`,
    Buffer.from(JSON.stringify(workspaces, null, 2) + "\n"),
  )
  vfs.writeFile(
    `${DEMO_HOME}/.harold/agents.json`,
    Buffer.from(JSON.stringify(agents, null, 2) + "\n"),
  )

  for (const binPath of Object.values(AGENT_BINARIES)) {
    vfs.writeFile(binPath, Buffer.from("#!/bin/sh\n"), { mode: FILE_MODE_EXECUTABLE })
  }

  const writeCatRepo = (root: string): void => {
    vfs.writeFile(`${root}/README.md`, Buffer.from("# Cat Screensaver\n"))
    vfs.writeFile(
      `${root}/package.json`,
      Buffer.from('{"name":"cat-screensaver","private":true,"type":"module"}\n'),
    )
    vfs.writeFile(`${root}/src/settings.js`, Buffer.from(INITIAL_SETTINGS_JS))
    vfs.writeFile(`${root}/src/main.js`, Buffer.from(INITIAL_MAIN_JS))
  }

  writeCatRepo(`${DEMO_HOME}/sites/cat-screensaver`)
  writeCatRepo(CAT_WORKTREE_ROOT)

  vfs.writeFile(
    `${DEMO_HOME}/sites/moonlit-garden/README.md`,
    Buffer.from("# Moonlit Garden\n"),
  )
  vfs.writeFile(
    `${DEMO_HOME}/sites/moonlit-garden/scene.js`,
    Buffer.from('export const palette = ["#0b1020", "#27325a", "#b6f36b"]\n'),
  )
  vfs.writeFile(`${DEMO_HOME}/sites/meow/README.md`, Buffer.from("# Meow\n"))
  vfs.writeFile(
    `${DEMO_HOME}/sites/meow/synth.js`,
    Buffer.from("export const meow = (pitch = 440) => Math.sin(pitch * 0.02)\n"),
  )
  vfs.writeFile(
    `${DEMO_HOME}/sites/fish-screensaver-for-cats/README.md`,
    Buffer.from("# Fish Screensaver for Cats\n"),
  )

  return [
    {
      root: `${DEMO_HOME}/sites/cat-screensaver`,
      branch: "main",
      defaultBranch: "main",
      headSha: "8f3a19c204b7e11234567890abcdef1234567890",
      mergeBaseSha: "8f3a19c204b7e11234567890abcdef1234567890",
      worktreeGroup: "cat-screensaver",
      isMainWorktree: true,
    },
    {
      root: CAT_WORKTREE_ROOT,
      branch: "feat/cat-mode",
      defaultBranch: "main",
      headSha: "8f3a19c204b7e11234567890abcdef1234567890",
      mergeBaseSha: "8f3a19c204b7e11234567890abcdef1234567890",
      worktreeGroup: "cat-screensaver",
      isMainWorktree: false,
    },
    {
      root: `${DEMO_HOME}/sites/moonlit-garden`,
      branch: "main",
      defaultBranch: "main",
      headSha: "4c2d91a0e8b31234567890abcdef123456789012",
      mergeBaseSha: "4c2d91a0e8b31234567890abcdef123456789012",
      worktreeGroup: "moonlit-garden",
      isMainWorktree: true,
    },
    {
      root: `${DEMO_HOME}/sites/meow`,
      branch: "main",
      defaultBranch: "main",
      headSha: "9e7b12c4d5f61234567890abcdef123456789034",
      mergeBaseSha: "9e7b12c4d5f61234567890abcdef123456789034",
      worktreeGroup: "meow",
      isMainWorktree: true,
    },
    {
      root: `${DEMO_HOME}/sites/fish-screensaver-for-cats`,
      branch: "main",
      defaultBranch: "main",
      headSha: "2a5f80d1c3e41234567890abcdef123456789056",
      mergeBaseSha: "2a5f80d1c3e41234567890abcdef123456789056",
      worktreeGroup: "fish-screensaver-for-cats",
      isMainWorktree: true,
    },
  ]
}

export const createSeededSessions = (agentId: string): Array<SeededSession> => {
  if (agentId === "opencode") {
    return [
      {
        sessionId: "ses_demo_opencode_0001",
        cwd: `${DEMO_HOME}/sites/moonlit-garden`,
        title: "Add firefly glow to moonlit garden",
        updatedAt: "2026-11-09T23:18:00Z",
        turnIndex: 3,
        history: [
          { role: "user", text: "Add firefly glow to the moonlit garden scene." },
          {
            role: "assistant",
            text: "Added a soft `#b6f36b` firefly pass to `scene.js` and verified the palette contrast.",
          },
        ],
        usage: {
          used: 38400,
          size: 1000000,
          cost: { amount: 0.009, currency: "USD" },
        },
      },
      {
        sessionId: "ses_demo_opencode_0002",
        cwd: `${DEMO_HOME}/sites/meow`,
        title: "Tune meow synth pitch envelope",
        updatedAt: "2026-11-09T22:50:00Z",
        turnIndex: 3,
        history: [
          { role: "user", text: "Smooth out the attack on the meow synth." },
          {
            role: "assistant",
            text: "Updated `synth.js` with a 40ms fade-in envelope so notes don't click.",
          },
        ],
      },
    ]
  }
  return [
    {
      sessionId: `ses_demo_${agentId.replace(/[^a-z0-9]/gi, "_")}_0001`,
      cwd: CAT_WORKTREE_ROOT,
      title: "Review cat-screensaver defaults",
      updatedAt: "2026-11-09T22:45:00Z",
      turnIndex: 3,
      history: [
        { role: "user", text: "Check the default settings in cat-screensaver." },
        {
          role: "assistant",
          text: "Checked `src/settings.js`. `speed` defaults to `1` and `showClock` defaults to `true`.",
        },
      ],
    },
  ]
}
