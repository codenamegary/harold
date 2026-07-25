import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../query/queryKeys"
import { fetchStatus } from "./fetchStatus"

export const useStatusQuery = () =>
  useQuery({
    queryKey: queryKeys.status,
    queryFn: fetchStatus,
  })
