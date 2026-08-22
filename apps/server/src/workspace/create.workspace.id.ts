import { ulid } from "ulid"

const workspaceIdPrefix = "ws_"

export const createWorkspaceId = (): string => `${workspaceIdPrefix}${ulid()}`
