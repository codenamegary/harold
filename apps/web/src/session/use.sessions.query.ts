import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { fetchSessions } from "./fetch.sessions"

export const useSessionsQuery = (cwd?: string | null) => {
  const scopedCwd =
    cwd === null || cwd === undefined || cwd === "" ? undefined : cwd

  return useQuery({
    queryKey: queryKeys.sessions(scopedCwd),
    queryFn: () =>
      fetchSessions(scopedCwd === undefined ? {} : { cwd: scopedCwd }),
  })
}
