const connectionsByDeviceId = new Map<string, Set<object>>()

const REVOKE_CLOSE_CODE = 1008
const REVOKE_CLOSE_REASON = "unauthorized"

export type RegisterDevicePresenceParams = {
  deviceId: string
  connection: object
}

type CloseableConnection = {
  close: (code?: number, reason?: string) => void
}

const isCloseableConnection = (connection: object): connection is CloseableConnection =>
  "close" in connection && typeof Reflect.get(connection, "close") === "function"

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

export const closeDeviceConnections = (deviceId: string): void => {
  const connections = connectionsByDeviceId.get(deviceId)
  if (connections === undefined) {
    return
  }

  for (const connection of [...connections]) {
    if (isCloseableConnection(connection)) {
      connection.close(REVOKE_CLOSE_CODE, REVOKE_CLOSE_REASON)
    }
  }
}

export const clearDevicePresence = (): void => {
  connectionsByDeviceId.clear()
}
