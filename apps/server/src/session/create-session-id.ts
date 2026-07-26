import { ulid } from "ulid"

const sessionIdPrefix = "sess_"

export const createSessionId = (): string => `${sessionIdPrefix}${ulid()}`
