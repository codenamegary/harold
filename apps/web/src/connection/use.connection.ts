import { Status } from "contracts/http/status"
import { useCallback } from "react"
import { ConnectionState } from "./connection.state"
import { useStatusQuery } from "./use.status.query"

export type ConnectionValue = {
  connection: ConnectionState
  refetch: () => Promise<void>
}

const connectionFromQuery = (
  data: Status | undefined,
  isLoading: boolean,
  isError: boolean,
): ConnectionState => {
  if (data !== undefined) {
    return { phase: "online", status: data }
  }

  if (isLoading) {
    return { phase: "loading" }
  }

  if (isError) {
    return { phase: "unreachable" }
  }

  return { phase: "loading" }
}

export const useConnection = (): ConnectionValue => {
  const { data, isLoading, isError, refetch: refetchQuery } = useStatusQuery()

  const connection = connectionFromQuery(data, isLoading, isError)

  const refetch = useCallback(async () => {
    await refetchQuery()
  }, [refetchQuery])

  return { connection, refetch }
}
