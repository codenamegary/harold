import {
  AURORA_FEATURE_WORKTREE_PATH,
  AURORA_WORKSPACE_ID,
  AURORA_WORKSPACE_PATH,
  PIXEL_WORKSPACE_ID,
  PIXEL_WORKSPACE_PATH,
} from "./workspaces"

export type DemoSeedSession = {
  id: string
  workspaceId: string
  title: string
  cwd: string
  worktreePath: string | null
  createdAt: string
  updatedAt: string
}

export const AURORA_DARK_MODE_SESSION_ID = "ses_demo_add_dark_mode_toggle"
export const PIXEL_IMAGE_RESIZE_SESSION_ID = "ses_demo_fix_image_resize_bug"
export const AURORA_RELEASE_NOTES_SESSION_ID = "ses_demo_review_release_notes"

export const createSeedSessions = (nowMs: number): ReadonlyArray<DemoSeedSession> => {
  const twoMinutesAgo = new Date(nowMs - 2 * 60 * 1000).toISOString()
  const eighteenMinutesAgo = new Date(nowMs - 18 * 60 * 1000).toISOString()
  const fortyFiveMinutesAgo = new Date(nowMs - 45 * 60 * 1000).toISOString()

  return [
    {
      id: AURORA_DARK_MODE_SESSION_ID,
      workspaceId: AURORA_WORKSPACE_ID,
      title: "Add dark mode toggle",
      cwd: AURORA_WORKSPACE_PATH,
      worktreePath: AURORA_FEATURE_WORKTREE_PATH,
      createdAt: new Date(nowMs - 40 * 60 * 1000).toISOString(),
      updatedAt: twoMinutesAgo,
    },
    {
      id: PIXEL_IMAGE_RESIZE_SESSION_ID,
      workspaceId: PIXEL_WORKSPACE_ID,
      title: "Fix image resize bug",
      cwd: PIXEL_WORKSPACE_PATH,
      worktreePath: null,
      createdAt: new Date(nowMs - 90 * 60 * 1000).toISOString(),
      updatedAt: eighteenMinutesAgo,
    },
    {
      id: AURORA_RELEASE_NOTES_SESSION_ID,
      workspaceId: AURORA_WORKSPACE_ID,
      title: "Review the release notes",
      cwd: AURORA_WORKSPACE_PATH,
      worktreePath: null,
      createdAt: new Date(nowMs - 2 * 60 * 60 * 1000).toISOString(),
      updatedAt: fortyFiveMinutesAgo,
    },
  ]
}
