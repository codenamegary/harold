import { FilesystemPathError } from "./filesystem.errors"

export type CanonicalizePathResult =
  | { ok: true; canonicalPath: string }
  | { ok: false; error: FilesystemPathError }

export type CanonicalizePath = (inputPath: string) => CanonicalizePathResult

export type FilesystemEntryName = Readonly<{ name: string }>

export type ReadDirectoryEntries = (dirPath: string) => Promise<ReadonlyArray<FilesystemEntryName>>

export type StatPathResult =
  | { ok: true; canonicalPath: string; isDirectory: boolean }
  | { ok: false }

export type StatPath = (inputPath: string) => Promise<StatPathResult>

export type GetHomeDirectory = () => string

export type CreateDirectoryPortResult =
  | { ok: true }
  | { ok: false; error: { kind: "already_exists" } | { kind: "permission_denied" } }

export type CreateDirectoryPort = (dirPath: string) => Promise<CreateDirectoryPortResult>
