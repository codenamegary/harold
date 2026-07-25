import React, { useCallback, useEffect, useMemo, useState } from "react"
import { ConnectionContext } from "./connectionContext"
import { ConnectionState } from "./connectionState"
import { fetchStatus } from "./fetchStatus"

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
