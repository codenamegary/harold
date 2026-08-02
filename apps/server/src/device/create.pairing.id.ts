import { ulid } from "ulid"

const pairingIdPrefix = "pair_"

export const createPairingId = (): string => `${pairingIdPrefix}${ulid()}`
