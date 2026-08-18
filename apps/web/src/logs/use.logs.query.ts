import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { fetchLogs, FetchLogsParams } from "./fetch.logs"

export const useLogsQuery = (params: FetchLogsParams = {}) =>
  useQuery({
    queryKey: queryKeys.logs({ level: params.level, source: params.source }),
    queryFn: () => fetchLogs(params),
  })
