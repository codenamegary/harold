import { createContext } from "react"
import { ConnectionState } from "./connectionState"

export type ConnectionContextValue = {
  connection: ConnectionState
  refetch: () => Promise<void>
}

export const ConnectionContext = createContext<ConnectionContextValue | null>(null)
