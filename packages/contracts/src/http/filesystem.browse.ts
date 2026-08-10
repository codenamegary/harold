import { z } from "zod"

export const FILESYSTEM_DIRECTORIES_PATH = "/v1/filesystem/directories" as const

export const ListFilesystemDirectoriesQuerySchema = z.strictObject({
  root: z.string().min(1),
})

export const FilesystemDirectorySchema = z.strictObject({
  name: z.string().min(1),
  path: z.string().min(1),
})

export const FilesystemDirectoryCollectionSchema = z.strictObject({
  items: z.array(FilesystemDirectorySchema),
})

export type ListFilesystemDirectoriesQuery = z.infer<
  typeof ListFilesystemDirectoriesQuerySchema
>
export type FilesystemDirectory = z.infer<typeof FilesystemDirectorySchema>
export type FilesystemDirectoryCollection = z.infer<
  typeof FilesystemDirectoryCollectionSchema
>
