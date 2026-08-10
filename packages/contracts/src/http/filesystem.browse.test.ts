import { describe, expect, test } from "bun:test"
import {
  FilesystemDirectoryCollectionSchema,
  ListFilesystemDirectoriesQuerySchema,
} from "./filesystem.browse"

describe("ListFilesystemDirectoriesQuerySchema", () => {
  test("accepts a root path", () => {
    expect(ListFilesystemDirectoriesQuerySchema.parse({ root: "/home/ops/code" })).toEqual({
      root: "/home/ops/code",
    })
  })

  test("rejects an empty root", () => {
    expect(() => ListFilesystemDirectoriesQuerySchema.parse({ root: "" })).toThrow()
  })
})

describe("FilesystemDirectoryCollectionSchema", () => {
  test("accepts a directory list", () => {
    const collection = {
      items: [
        { name: "alpha", path: "/home/ops/code/alpha" },
        { name: "beta", path: "/home/ops/code/beta" },
      ],
    }

    expect(FilesystemDirectoryCollectionSchema.parse(collection)).toEqual(collection)
  })

  test("rejects extra fields", () => {
    expect(() =>
      FilesystemDirectoryCollectionSchema.parse({
        items: [{ name: "alpha", path: "/home/ops/code/alpha", nested: true }],
      }),
    ).toThrow()
  })
})
