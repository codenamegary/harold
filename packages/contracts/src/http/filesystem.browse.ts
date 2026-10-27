import { z } from "zod"

export const FILESYSTEM_DIRECTORIES_PATH = "/v1/filesystem/directories" as const

export const ListFilesystemDirectoriesQuerySchema = z.strictObject({
  root: z.string().min(1).optional(),
})

export const FilesystemDirectorySchema = z.strictObject({
  name: z.string().min(1),
  path: z.string().min(1),
})

export const FilesystemDirectoryCollectionSchema = z.strictObject({
  path: z.string().min(1),
  parent: z.string().min(1).nullable(),
  items: z.array(FilesystemDirectorySchema),
})

export const CreateFilesystemDirectoryBodySchema = z.strictObject({
  parent: z.string().min(1),
  name: z.string().min(1),
})

export const FilesystemDirectoryCreatedSchema = z.strictObject({
  name: z.string().min(1),
  path: z.string().min(1),
})

export type ListFilesystemDirectoriesQuery = z.infer<typeof ListFilesystemDirectoriesQuerySchema>
export type FilesystemDirectory = z.infer<typeof FilesystemDirectorySchema>
export type FilesystemDirectoryCollection = z.infer<typeof FilesystemDirectoryCollectionSchema>
export type CreateFilesystemDirectoryBody = z.infer<typeof CreateFilesystemDirectoryBodySchema>
export type FilesystemDirectoryCreated = z.infer<typeof FilesystemDirectoryCreatedSchema>
