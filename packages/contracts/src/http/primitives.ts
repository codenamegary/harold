import { z } from "zod"

export const IdSchema = z.string().min(1)
export const TimestampSchema = z.string().datetime()
export const CursorSchema = z.string().min(1)
