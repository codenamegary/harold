import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { fetchFilesystemDirectories } from "./fetch.filesystem.directories"

export const useFilesystemDirectoriesQuery = (
  root: string | undefined,
  options?: { enabled?: boolean },
) =>
  useQuery({
    queryKey: queryKeys.filesystemDirectories(root ?? ""),
    queryFn: () => {
      if (root === undefined || root === "") {
        throw new Error("Filesystem directories query requires a root")
      }
      return fetchFilesystemDirectories(root)
    },
    enabled: (options?.enabled ?? true) && root !== undefined && root !== "",
  })
