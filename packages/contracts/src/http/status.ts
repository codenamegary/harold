import { z } from "zod";
import { TimestampSchema } from "./primitives";

export const AgentServerStateSchema = z.enum([
  "starting",
  "online",
  "shutting_down",
  "offline",
]);

export type AgentServerState = z.infer<typeof AgentServerStateSchema>;

export const AcpStateSchema = z.enum(["stopped", "starting", "ready", "error"]);

export const StatusSchema = z
  .object({
    version: z.string().min(1),
    state: AgentServerStateSchema,
    bindAddress: z.literal("127.0.0.1"),
    port: z.number().int().positive(),
    startedAt: TimestampSchema,
    acp: z.object({
      state: AcpStateSchema,
      activeSessions: z.number().int().nonnegative(),
    }),
  })
  .strict();

export type Status = z.infer<typeof StatusSchema>;
