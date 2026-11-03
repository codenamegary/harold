import path from "node:path"

export type SessionWorktreePathCandidateKind = "edit" | "delete" | "move"

export type SessionWorktreePathCandidate = {
  toolCallId: string
  kind: SessionWorktreePathCandidateKind
  path: string
}

const CANDIDATE_KINDS: ReadonlySet<string> = new Set(["edit", "delete", "move"])

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined

const asArray = (value: unknown): ReadonlyArray<unknown> => (Array.isArray(value) ? value : [])

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined

const normalizeKind = (value: unknown): SessionWorktreePathCandidateKind | undefined => {
  const raw = readString(value)
  if (raw === "write") {
    return "edit"
  }
  return raw !== undefined && CANDIDATE_KINDS.has(raw)
    ? (raw as SessionWorktreePathCandidateKind)
    : undefined
}

/**
 * Reads the kind an update declares. Tool call updates may omit it, so callers
 * remember the last declared kind for that toolCallId.
 */
export const sessionWorktreePathCandidateKind = (
  update: unknown,
): SessionWorktreePathCandidateKind | undefined => {
  const record = asRecord(update)
  return record === undefined ? undefined : normalizeKind(record["kind"] ?? record["toolKind"])
}

const pushPath = (paths: string[], value: unknown) => {
  const candidate = readString(value)
  if (candidate === undefined || !path.isAbsolute(candidate)) {
    return
  }
  if (!paths.includes(candidate)) {
    paths.push(candidate)
  }
}

const readPaths = (update: Record<string, unknown>): ReadonlyArray<string> => {
  const paths: string[] = []

  for (const location of asArray(update["locations"])) {
    pushPath(paths, asRecord(location)?.["path"])
  }

  const content = update["content"]
  for (const block of [
    ...asArray(content),
    ...(asRecord(content) === undefined ? [] : [content]),
  ]) {
    pushPath(paths, asRecord(block)?.["path"])
  }

  const rawInput = asRecord(update["rawInput"])
  if (rawInput !== undefined) {
    for (const key of ["file_path", "path", "oldPath", "newPath"]) {
      pushPath(paths, rawInput[key])
    }
  }

  return paths
}

/**
 * A tool call or tool call update is a candidate only when its kind is edit,
 * delete, or move. Updates may omit the kind, so callers pass the kind they
 * already know for that toolCallId.
 */
export const parseSessionWorktreePathCandidate = (
  update: unknown,
  knownKind?: SessionWorktreePathCandidateKind,
): SessionWorktreePathCandidate | null => {
  const record = asRecord(update)
  if (record === undefined) {
    return null
  }

  const updateKind = record["sessionUpdate"] ?? record["updateKind"]
  if (updateKind !== "tool_call" && updateKind !== "tool_call_update") {
    return null
  }

  const toolCallId = readString(record["toolCallId"])
  if (toolCallId === undefined) {
    return null
  }

  const kind = sessionWorktreePathCandidateKind(update) ?? knownKind
  if (kind === undefined) {
    return null
  }

  const paths = readPaths(record)
  const candidatePath = paths.at(-1)
  if (candidatePath === undefined) {
    return null
  }

  return {
    toolCallId,
    kind,
    path: candidatePath,
  }
}
