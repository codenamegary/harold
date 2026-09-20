import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { attachmentsFolderName } from "contracts/http/attachments"
import {
  DeleteAttachmentFile,
  EnsureAttachmentsDir,
  EnsureGitignoreEntry,
  ReadAttachmentBytes,
  WriteAttachmentBytes,
} from "./attachments.ports"

const gitignoreEntry = `${attachmentsFolderName}/`

const attachmentsDir = (workspacePath: string): string =>
  path.join(workspacePath, attachmentsFolderName)

export const makeEnsureAttachmentsDir = (): EnsureAttachmentsDir => async (workspacePath) => {
  const dir = attachmentsDir(workspacePath)
  await mkdir(dir, { recursive: true })
  return dir
}

export const makeWriteAttachmentBytes =
  (): WriteAttachmentBytes =>
  async ({ filePath, bytes }) => {
    await writeFile(filePath, bytes)
  }

export const makeReadAttachmentBytes = (): ReadAttachmentBytes => async (filePath) => {
  try {
    const info = await stat(filePath)
    if (!info.isFile()) {
      return null
    }
  } catch {
    return null
  }

  return new Uint8Array(await readFile(filePath))
}

export const makeDeleteAttachmentFile = (): DeleteAttachmentFile => async (filePath) => {
  try {
    await unlink(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Appends the attachments folder to an existing workspace .gitignore.
 * Idempotent. A missing .gitignore is respected: one is never created.
 */
export const makeEnsureGitignoreEntry = (): EnsureGitignoreEntry => async (workspacePath) => {
  const gitignorePath = path.join(workspacePath, ".gitignore")

  let content: string
  try {
    content = await readFile(gitignorePath, "utf8")
  } catch {
    return
  }

  const alreadyIgnored = content.split("\n").some((line) => line.trim() === gitignoreEntry)
  if (alreadyIgnored) {
    return
  }

  const separator = content.endsWith("\n") || content === "" ? "" : "\n"
  await writeFile(gitignorePath, `${content}${separator}${gitignoreEntry}\n`, "utf8")
}
