import { ConnectionState } from "../connection/connection.state"

export type ServerDetailsDisplay = {
  endpoint: string
  runtimeVersion: string
  nodeJs: string
}

const missingValue = "—"

const missingServerDetails: ServerDetailsDisplay = {
  endpoint: missingValue,
  runtimeVersion: missingValue,
  nodeJs: missingValue,
}

export const serverDetailsDisplayByPhase = (
  connection: ConnectionState,
): ServerDetailsDisplay => {
  if (connection.phase !== "online") {
    return missingServerDetails
  }

  const { bindAddress, port, version } = connection.status

  return {
    endpoint: `http://${bindAddress}:${port}`,
    runtimeVersion: version,
    nodeJs: missingValue,
  }
}
