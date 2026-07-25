import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Status } from "contracts/http/status"
import { fetchStatus } from "./fetchStatus"

export type ConnectionState =
  | { phase: "loading" }
  | { phase: "online"; status: Status }
  | { phase: "unreachable" }

type ConnectionContextValue = {
  connection: ConnectionState
  refetch: () => Promise<void>
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null)

export const ConnectionProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [connection, setConnection] = useState<ConnectionState>({ phase: "loading" })

  const refetch = useCallback(async () => {
    setConnection({ phase: "loading" })

    try {
      const status = await fetchStatus()
      setConnection({ phase: "online", status })
    } catch {
      setConnection({ phase: "unreachable" })
    }
  }, [])

  useEffect(() => {
    void refetch()
  }, [refetch])

  const value = useMemo(
    () => ({
      connection,
      refetch,
    }),
    [connection, refetch],
  )

  return (
    <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>
  )
}

export const useConnection = (): ConnectionContextValue => {
  const context = useContext(ConnectionContext)

  if (context === null) {
    throw new Error("useConnection must be used within ConnectionProvider")
  }

  return context
}
