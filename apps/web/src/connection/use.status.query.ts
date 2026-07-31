import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { fetchStatus } from "./fetch.status"

export const STATUS_UNREACHABLE_POLL_MS = 1500

export const useStatusQuery = () =>
  useQuery({
    queryKey: queryKeys.status,
    queryFn: fetchStatus,
    refetchInterval: (query) =>
      query.state.status === "error" ? STATUS_UNREACHABLE_POLL_MS : false,
  })
