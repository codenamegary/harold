export type WhichFn = (binaryName: string) => string | null | undefined

export const resolveAgentPath = (
  binaryName: string,
  whichFn: WhichFn = (name) => Bun.which(name),
): string | null => whichFn(binaryName) ?? null
