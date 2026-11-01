import { z } from "zod"

export const GIT_SUMMARY_PATH = "/v1/git/summary" as const
export const GIT_WORKTREES_PATH = "/v1/git/worktrees" as const
export const GIT_CHANGES_PATH = "/v1/git/changes" as const
export const GIT_FILE_PATH = "/v1/git/file" as const

export const GitScopeSchema = z.enum(["uncommitted", "branch"])

export const GitFileStatusSchema = z.enum([
  "added",
  "modified",
  "deleted",
  "renamed",
  "copied",
  "type_changed",
  "untracked",
  "conflicted",
])

export const GitPathQuerySchema = z.strictObject({
  path: z.string().min(1),
})

export const GitChangesQuerySchema = z.strictObject({
  path: z.string().min(1),
  scope: GitScopeSchema,
})

export const GitFileQuerySchema = z.strictObject({
  path: z.string().min(1),
  scope: GitScopeSchema,
  file: z.string().min(1),
  oldPath: z.string().min(1).optional(),
})

export const GitWorktreeSchema = z.strictObject({
  path: z.string().min(1),
  branch: z.string().nullable(),
  headSha: z.string().min(1),
  isCurrent: z.boolean(),
  isMain: z.boolean(),
  dirtyFileCount: z.number().int().nonnegative().nullable(),
})

export const GitWorktreeCollectionSchema = z.strictObject({
  items: z.array(GitWorktreeSchema),
})

export const GitRepositorySchema = z.strictObject({
  root: z.string().min(1),
  currentWorktreePath: z.string().min(1),
  currentBranch: z.string().nullable(),
  defaultBranch: z.string().nullable(),
  headSha: z.string().min(1),
})

export const GitSummarySchema = z.strictObject({
  repository: GitRepositorySchema,
  uncommittedFileCount: z.number().int().nonnegative(),
})

export const GitChangedFileSchema = z.strictObject({
  path: z.string().min(1),
  oldPath: z.string().min(1).nullable(),
  status: GitFileStatusSchema,
  additions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
  binary: z.boolean(),
  submodule: z.boolean(),
})

export const GitChangesTotalsSchema = z.strictObject({
  files: z.number().int().nonnegative(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
})

export const GitChangesSchema = z.strictObject({
  scope: GitScopeSchema,
  baseRef: z.string().nullable(),
  mergeBaseSha: z.string().nullable(),
  headSha: z.string().min(1),
  files: z.array(GitChangedFileSchema),
  totals: GitChangesTotalsSchema,
  truncated: z.boolean(),
})

export const GitDiffLineKindSchema = z.enum(["context", "addition", "deletion"])

export const GitDiffLineSchema = z.strictObject({
  kind: GitDiffLineKindSchema,
  oldLineNumber: z.number().int().positive().nullable(),
  newLineNumber: z.number().int().positive().nullable(),
  text: z.string(),
})

export const GitDiffHunkSchema = z.strictObject({
  header: z.string(),
  oldStart: z.number().int().nonnegative(),
  oldLines: z.number().int().nonnegative(),
  newStart: z.number().int().nonnegative(),
  newLines: z.number().int().nonnegative(),
  lines: z.array(GitDiffLineSchema),
})

export const GitFileDiffSchema = z.strictObject({
  path: z.string().min(1),
  oldPath: z.string().min(1).nullable(),
  status: GitFileStatusSchema,
  additions: z.number().int().nonnegative().nullable(),
  deletions: z.number().int().nonnegative().nullable(),
  binary: z.boolean(),
  submodule: z.boolean(),
  hunks: z.array(GitDiffHunkSchema),
  truncated: z.boolean(),
})

export type GitScope = z.infer<typeof GitScopeSchema>
export type GitFileStatus = z.infer<typeof GitFileStatusSchema>
export type GitPathQuery = z.infer<typeof GitPathQuerySchema>
export type GitChangesQuery = z.infer<typeof GitChangesQuerySchema>
export type GitFileQuery = z.infer<typeof GitFileQuerySchema>
export type GitWorktree = z.infer<typeof GitWorktreeSchema>
export type GitWorktreeCollection = z.infer<typeof GitWorktreeCollectionSchema>
export type GitRepository = z.infer<typeof GitRepositorySchema>
export type GitSummary = z.infer<typeof GitSummarySchema>
export type GitChangedFile = z.infer<typeof GitChangedFileSchema>
export type GitChangesTotals = z.infer<typeof GitChangesTotalsSchema>
export type GitChanges = z.infer<typeof GitChangesSchema>
export type GitDiffLineKind = z.infer<typeof GitDiffLineKindSchema>
export type GitDiffLine = z.infer<typeof GitDiffLineSchema>
export type GitDiffHunk = z.infer<typeof GitDiffHunkSchema>
export type GitFileDiff = z.infer<typeof GitFileDiffSchema>
