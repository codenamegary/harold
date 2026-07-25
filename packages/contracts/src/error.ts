import { z } from "zod";

export const ApiErrorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const ApiErrorSchema = z
  .object({
    error: z.object({
      code: z.string().min(1),
      message: z.string().min(1),
      details: z.array(ApiErrorDetailSchema).optional(),
    }),
  })
  .strict();

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiErrorDetail = z.infer<typeof ApiErrorDetailSchema>;
