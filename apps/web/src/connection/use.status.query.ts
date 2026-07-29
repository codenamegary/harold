import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { fetchStatus } from "./fetch.status"

export const useStatusQuery = () =>
  useQuery({
    queryKey: queryKeys.status,
    queryFn: fetchStatus,
  })
