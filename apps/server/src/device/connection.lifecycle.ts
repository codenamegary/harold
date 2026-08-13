import { DeviceRepository } from "./repository"

type TouchDeviceLastSeenParams = {
  deviceRepository: DeviceRepository
  deviceId: string
  occurredAt?: string
}

export type TouchDeviceLastSeenResult =
  | { ok: true }
  | { ok: false; reason: "closed_database" }

const nowIso = (): string => new Date().toISOString()

const isClosedDatabaseError = (error: unknown): boolean =>
  error instanceof RangeError && error.message.includes("closed database")

export const touchDeviceLastSeen = (
  params: TouchDeviceLastSeenParams,
): TouchDeviceLastSeenResult => {
  const occurredAt = params.occurredAt ?? nowIso()

  try {
    params.deviceRepository.touchLastSeen({
      deviceId: params.deviceId,
      lastSeenAt: occurredAt,
    })
    return { ok: true }
  } catch (error: unknown) {
    if (isClosedDatabaseError(error)) {
      return { ok: false, reason: "closed_database" }
    }
    throw error
  }
}
