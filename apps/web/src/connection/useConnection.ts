import { useContext } from "react"
import { ConnectionContext, ConnectionContextValue } from "./connectionContext"

export const useConnection = (): ConnectionContextValue => {
  const context = useContext(ConnectionContext)

  if (context === null) {
    throw new Error("useConnection must be used within ConnectionProvider")
  }

  return context
}
