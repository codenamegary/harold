export const isMissingFilesystemError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error.code === "ENOENT" || error.code === "ENOTDIR")

export const isPermissionFilesystemError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error.code === "EACCES" || error.code === "EPERM")

export type FilesystemPathError =
  | { kind: "missing" }
  | { kind: "not_directory" }
  | { kind: "unreadable" }
