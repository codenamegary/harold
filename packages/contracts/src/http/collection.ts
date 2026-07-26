import { z } from "zod"
import { CursorSchema } from "./primitives"

export const PageInfoSchema = z
  .object({
    limit: z.number().int().positive(),
    nextCursor: CursorSchema.optional(),
    previousCursor: CursorSchema.optional(),
    count: z.number().int().nonnegative().optional(),
  })
  .strict()

export const createCollectionSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z
    .object({
      items: z.array(itemSchema),
      page: PageInfoSchema,
    })
    .strict()

export type PageInfo = z.infer<typeof PageInfoSchema>
