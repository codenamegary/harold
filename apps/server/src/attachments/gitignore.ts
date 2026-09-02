import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

const gitignoreEntry = ".agent-server/attachments/"

/**
 * Appends the attachments folder to an existing workspace .gitignore.
 * Idempotent. A missing .gitignore is respected: one is never created.
 */
export const ensureGitignoreEntry = async (
  workspacePath: string,
): Promise<{ patched: boolean; skipped: "no-gitignore" | "already-present" | null }> => {
  const gitignorePath = path.join(workspacePath, ".gitignore")

  let content: string
  try {
    content = await readFile(gitignorePath, "utf8")
  } catch {
    return { patched: false, skipped: "no-gitignore" }
  }

  const alreadyIgnored = content
    .split("\n")
    .some((line) => line.trim() === gitignoreEntry)

  if (alreadyIgnored) {
    return { patched: false, skipped: "already-present" }
  }

  const separator = content.endsWith("\n") || content === "" ? "" : "\n"
  await writeFile(gitignorePath, `${content}${separator}${gitignoreEntry}\n`, "utf8")
  return { patched: true, skipped: null }
}

export const attachmentsDir = (workspacePath: string) =>
  path.join(workspacePath, ".agent-server", "attachments")

export const ensureAttachmentsDir = async (workspacePath: string) => {
  const dir = attachmentsDir(workspacePath)
  await mkdir(dir, { recursive: true })
  return dir
}
