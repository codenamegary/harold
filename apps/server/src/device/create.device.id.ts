import { ulid } from "ulid"

const deviceIdPrefix = "device_"

export const createDeviceId = (): string => `${deviceIdPrefix}${ulid()}`
