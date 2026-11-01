export type ResolvedRepository = Readonly<{
  root: string
  currentWorktreePath: string
  currentBranch: string | null
  defaultBranch: string | null
  headSha: string
  defaultRef: string | null
  mergeBaseSha: string | null
}>
