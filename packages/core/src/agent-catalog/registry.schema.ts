import { z } from "zod"

const binaryPlatformSchema = z
  .object({
    archive: z.string().min(1),
    cmd: z.string().min(1),
    args: z.array(z.string()).optional(),
    sha256: z.string().optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .passthrough()

const npxDistributionSchema = z
  .object({
    package: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .passthrough()

const uvxDistributionSchema = z
  .object({
    package: z.string().min(1),
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
  })
  .passthrough()

const distributionSchema = z
  .object({
    binary: z.record(z.string(), binaryPlatformSchema).optional(),
    npx: npxDistributionSchema.optional(),
    uvx: uvxDistributionSchema.optional(),
  })
  .passthrough()
  .refine(
    (value) => value.binary !== undefined || value.npx !== undefined || value.uvx !== undefined,
    { message: "distribution requires binary, npx, or uvx" },
  )

export const registryAgentSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    version: z.string().min(1).optional(),
    description: z.string().optional(),
    repository: z.string().optional(),
    website: z.string().optional(),
    authors: z.array(z.string()).optional(),
    license: z.string().optional(),
    icon: z.string().optional(),
    distribution: distributionSchema,
  })
  .passthrough()

export const registrySnapshotSchema = z
  .object({
    version: z.string().min(1),
    agents: z.array(registryAgentSchema).min(1),
  })
  .passthrough()

export type RegistryAgent = z.infer<typeof registryAgentSchema>
export type RegistrySnapshot = z.infer<typeof registrySnapshotSchema>
export type RegistryDistribution = z.infer<typeof distributionSchema>
