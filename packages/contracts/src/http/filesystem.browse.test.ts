import { describe, expect, test } from "bun:test"
import {
  CreateFilesystemDirectoryBodySchema,
  FilesystemDirectoryCollectionSchema,
  FilesystemDirectoryCreatedSchema,
  ListFilesystemDirectoriesQuerySchema,
} from "./filesystem.browse"

describe("ListFilesystemDirectoriesQuerySchema", () => {
  test("accepts a root path", () => {
    expect(ListFilesystemDirectoriesQuerySchema.parse({ root: "/home/ops/code" })).toEqual({
      root: "/home/ops/code",
    })
  })

  test("accepts an omitted root", () => {
    expect(ListFilesystemDirectoriesQuerySchema.parse({})).toEqual({})
  })

  test("rejects an empty root", () => {
    expect(() => ListFilesystemDirectoriesQuerySchema.parse({ root: "" })).toThrow()
  })
})

describe("FilesystemDirectoryCollectionSchema", () => {
  test("accepts a directory list with a canonical path and parent", () => {
    const collection = {
      path: "/home/ops/code",
      parent: "/home/ops",
      items: [
        { name: "alpha", path: "/home/ops/code/alpha" },
        { name: "beta", path: "/home/ops/code/beta" },
      ],
    }

    expect(FilesystemDirectoryCollectionSchema.parse(collection)).toEqual(collection)
  })

  test("accepts a null parent at the filesystem root", () => {
    expect(
      FilesystemDirectoryCollectionSchema.parse({
        path: "/",
        parent: null,
        items: [],
      }),
    ).toEqual({ path: "/", parent: null, items: [] })
  })

  test("requires the browsed path", () => {
    expect(() =>
      FilesystemDirectoryCollectionSchema.parse({
        parent: "/home/ops",
        items: [],
      }),
    ).toThrow()
  })

  test("rejects extra fields", () => {
    expect(() =>
      FilesystemDirectoryCollectionSchema.parse({
        path: "/home/ops/code",
        parent: "/home/ops",
        items: [{ name: "alpha", path: "/home/ops/code/alpha", nested: true }],
      }),
    ).toThrow()
  })
})

describe("CreateFilesystemDirectoryBodySchema", () => {
  test("accepts a parent and name", () => {
    const body = { parent: "/home/ops", name: "widgets" }

    expect(CreateFilesystemDirectoryBodySchema.parse(body)).toEqual(body)
  })

  test("rejects an empty name", () => {
    expect(() =>
      CreateFilesystemDirectoryBodySchema.parse({ parent: "/home/ops", name: "" }),
    ).toThrow()
  })

  test("rejects an empty parent", () => {
    expect(() =>
      CreateFilesystemDirectoryBodySchema.parse({ parent: "", name: "widgets" }),
    ).toThrow()
  })
})

describe("FilesystemDirectoryCreatedSchema", () => {
  test("accepts a created directory", () => {
    expect(
      FilesystemDirectoryCreatedSchema.parse({
        name: "widgets",
        path: "/home/ops/widgets",
      }),
    ).toEqual({ name: "widgets", path: "/home/ops/widgets" })
  })

  test("rejects an empty path", () => {
    expect(() => FilesystemDirectoryCreatedSchema.parse({ name: "widgets", path: "" })).toThrow()
  })
})
