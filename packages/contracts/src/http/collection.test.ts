import { describe, expect, test } from "bun:test"
import { z } from "zod"
import { createCollectionSchema, PageInfoSchema } from "./collection"

const ItemSchema = z.strictObject({ id: z.string().min(1) })

describe("PageInfoSchema", () => {
  test("accepts page info with all optional fields", () => {
    const page = {
      limit: 20,
      nextCursor: "ws_02",
      previousCursor: "ws_00",
      count: 42,
    }

    expect(PageInfoSchema.parse(page)).toEqual(page)
  })

  test("accepts page info with only required limit", () => {
    const page = { limit: 10 }

    expect(PageInfoSchema.parse(page)).toEqual(page)
  })

  test("rejects prototype hasMore field", () => {
    expect(() =>
      PageInfoSchema.parse({ limit: 10, hasMore: true }),
    ).toThrow()
  })
})

describe("createCollectionSchema", () => {
  const CollectionSchema = createCollectionSchema(ItemSchema)

  test("accepts a collection with all page fields", () => {
    const collection = {
      items: [{ id: "ws_01" }],
      page: {
        limit: 20,
        nextCursor: "ws_02",
        previousCursor: "ws_00",
        count: 1,
      },
    }

    expect(CollectionSchema.parse(collection)).toEqual(collection)
  })

  test("accepts a collection with only required page fields", () => {
    const collection = {
      items: [{ id: "ws_01" }],
      page: { limit: 20 },
    }

    expect(CollectionSchema.parse(collection)).toEqual(collection)
  })

  test("rejects prototype hasMore on page", () => {
    expect(() =>
      CollectionSchema.parse({
        items: [{ id: "ws_01" }],
        page: { limit: 20, hasMore: false },
      }),
    ).toThrow()
  })
})
