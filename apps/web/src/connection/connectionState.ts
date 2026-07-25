import { Status } from "contracts/http/status"

export type ConnectionState =
  | { phase: "loading" }
  | { phase: "online"; status: Status }
  | { phase: "unreachable" }
