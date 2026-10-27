import path from "node:path"
import { FilesystemPathError } from "./filesystem.errors"
import { CanonicalizePath, CreateDirectoryPort } from "./filesystem.ports"

export type CreateDirectoryParams = Readonly<{
  parent: string
  name: string
}>

export type CreateDirectoryError =
  | { kind: "path"; error: FilesystemPathError }
  | { kind: "invalid_name" }
  | { kind: "already_exists" }
  | { kind: "permission_denied" }

export type CreateDirectoryResult =
  | { ok: true; value: { name: string; path: string } }
  | { ok: false; error: CreateDirectoryError }

export type CreateDirectory = (params: CreateDirectoryParams) => Promise<CreateDirectoryResult>

export type CreateDirectoryDeps = Readonly<{
  canonicalizePath: CanonicalizePath
  createDirectory: CreateDirectoryPort
}>

const isSinglePathSegment = (name: string): boolean =>
  name.length > 0 &&
  name !== "." &&
  name !== ".." &&
  !name.includes("/") &&
  !name.includes("\\") &&
  !name.includes("\0")

export const makeCreateDirectory =
  (deps: CreateDirectoryDeps): CreateDirectory =>
  async (params) => {
    if (!isSinglePathSegment(params.name)) {
      return { ok: false, error: { kind: "invalid_name" } }
    }

    const canonicalizeResult = deps.canonicalizePath(params.parent)
    if (!canonicalizeResult.ok) {
      return { ok: false, error: { kind: "path", error: canonicalizeResult.error } }
    }

    const targetPath = path.join(canonicalizeResult.canonicalPath, params.name)
    const created = await deps.createDirectory(targetPath)
    if (!created.ok) {
      return { ok: false, error: created.error }
    }

    return { ok: true, value: { name: params.name, path: targetPath } }
  }
