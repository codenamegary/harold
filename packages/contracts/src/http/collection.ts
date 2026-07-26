import { z } from "zod"
import { CursorSchema } from "./primitives"

export const PageInfoSchema = z.strictObject({
  limit: z.number().int().positive(),
  nextCursor: CursorSchema.optional(),
  previousCursor: CursorSchema.optional(),
  count: z.number().int().nonnegative().optional(),
})

export const createCollectionSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.strictObject({
    items: z.array(itemSchema),
    page: PageInfoSchema,
  })

export type PageInfo = z.infer<typeof PageInfoSchema>
