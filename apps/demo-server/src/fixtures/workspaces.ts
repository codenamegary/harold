export const DEMO_HOME = "/home/demo"
export const DEMO_PROJECTS_PATH = "/home/demo/projects"

export const AURORA_WORKSPACE_ID = "ws_aurora_web"
export const AURORA_WORKSPACE_NAME = "aurora-web"
export const AURORA_WORKSPACE_PATH = "/home/demo/projects/aurora-web"
export const AURORA_CURRENT_BRANCH = "feat/dark-mode"
export const AURORA_FEATURE_BRANCH = "feat/dark-mode-toggle"
export const AURORA_FEATURE_WORKTREE_PATH =
  "/home/demo/projects/aurora-web/.worktrees/dark-mode-toggle"

export const PIXEL_WORKSPACE_ID = "ws_pixel_garden"
export const PIXEL_WORKSPACE_NAME = "pixel-garden"
export const PIXEL_WORKSPACE_PATH = "/home/demo/projects/pixel-garden"
export const PIXEL_CURRENT_BRANCH = "main"

export type DemoWorkspaceFixture = {
  id: string
  name: string
  path: string
  state: "available" | "missing" | "unavailable"
  branch: string
  createdAt: string
  lastUsedAt: string
}

export const createWorkspaceFixtures = (nowMs: number): ReadonlyArray<DemoWorkspaceFixture> => {
  const createdAt = new Date(nowMs - 3 * 24 * 60 * 60 * 1000).toISOString()
  return [
    {
      id: AURORA_WORKSPACE_ID,
      name: AURORA_WORKSPACE_NAME,
      path: AURORA_WORKSPACE_PATH,
      state: "available",
      branch: AURORA_CURRENT_BRANCH,
      createdAt,
      lastUsedAt: new Date(nowMs - 2 * 60 * 1000).toISOString(),
    },
    {
      id: PIXEL_WORKSPACE_ID,
      name: PIXEL_WORKSPACE_NAME,
      path: PIXEL_WORKSPACE_PATH,
      state: "available",
      branch: PIXEL_CURRENT_BRANCH,
      createdAt,
      lastUsedAt: new Date(nowMs - 18 * 60 * 1000).toISOString(),
    },
  ]
}
