import { z } from "zod";

export const CursorSchema = z.string().min(1);
