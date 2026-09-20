import { ulid } from "ulid"

const turnIdPrefix = "turn_"

export const createTurnId = (): string => `${turnIdPrefix}${ulid()}`
