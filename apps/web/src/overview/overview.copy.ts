import { ConnectionPhase } from "../connection/connection.phase"

type HeroCopy = {
  title: string
  description: string
}

export const heroCopyByPhase: Record<ConnectionPhase, HeroCopy> = {
  loading: {
    title: "Checking server status.",
    description: "Waiting for a response from your local ACP server.",
  },
  online: {
    title: "Everything is operational.",
    description: "Your local ACP server is accepting connections and agents are ready.",
  },
  unreachable: {
    title: "Server unreachable.",
    description: "The operator console cannot reach your local ACP server.",
  },
}
