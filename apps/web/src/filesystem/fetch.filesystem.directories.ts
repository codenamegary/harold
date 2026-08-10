import {
  FILESYSTEM_DIRECTORIES_PATH,
  FilesystemDirectoryCollectionSchema,
} from "contracts/http/filesystem.browse"

export const fetchFilesystemDirectories = async (root: string) => {
  const params = new URLSearchParams({ root })
  const response = await fetch(`${FILESYSTEM_DIRECTORIES_PATH}?${params.toString()}`)

  if (!response.ok) {
    throw new Error(`Filesystem directories fetch failed with ${response.status}`)
  }

  const payload: unknown = await response.json()
  return FilesystemDirectoryCollectionSchema.parse(payload)
}
