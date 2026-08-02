const connectionsByDeviceId = new Map<string, Set<object>>()

export type RegisterDevicePresenceParams = {
  deviceId: string
  connection: object
}

export const registerDevicePresence = (
  params: RegisterDevicePresenceParams,
): (() => void) => {
  const existing = connectionsByDeviceId.get(params.deviceId)
  const connections = existing ?? new Set<object>()
  if (existing === undefined) {
    connectionsByDeviceId.set(params.deviceId, connections)
  }

  connections.add(params.connection)

  return () => {
    const current = connectionsByDeviceId.get(params.deviceId)
    if (current === undefined) {
      return
    }

    current.delete(params.connection)
    if (current.size === 0) {
      connectionsByDeviceId.delete(params.deviceId)
    }
  }
}

export const isDeviceOnline = (deviceId: string): boolean => {
  const connections = connectionsByDeviceId.get(deviceId)
  return connections !== undefined && connections.size > 0
}

export const clearDevicePresence = (): void => {
  connectionsByDeviceId.clear()
}
