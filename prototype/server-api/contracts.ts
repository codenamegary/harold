import { z } from "zod";

const id = z.string().min(1);
const timestamp = z.string().datetime();

export const ConnectionModeSchema = z.enum([
  "local",
  "tailscale",
  "cloud-proxy",
]);

export const ServerStatusSchema = z.object({
  id: z.literal("status"),
  name: z.string().min(1),
  version: z.string(),
  state: z.enum(["starting", "online", "degraded", "offline"]),
  connectionMode: ConnectionModeSchema,
  localUrl: z.string().url(),
  publicUrl: z.string().url().nullable(),
  startedAt: timestamp,
  lastHealthCheckAt: timestamp,
  acp: z.object({
    state: z.enum(["starting", "ready", "error", "stopped"]),
    pid: z.number().int().positive().nullable(),
    version: z.string().nullable(),
    activeSessions: z.number().int().nonnegative(),
  }),
});

export const ServerSettingsSchema = z.object({
  id: z.literal("settings"),
  connectionMode: ConnectionModeSchema,
  publicUrl: z.string().url().nullable(),
  allowedWorkspaceRoots: z.array(z.string().startsWith("/")),
  approvalPolicy: z.enum(["always-ask", "workspace-trusted", "unattended"]),
  pairingEnabled: z.boolean(),
  pairingCodeTtlSeconds: z.number().int().min(60).max(3600),
});

export const WorkspaceSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  path: z.string().startsWith("/"),
  additionalDirectories: z.array(z.string().startsWith("/")),
  state: z.enum(["available", "missing", "unavailable"]),
  agentCount: z.number().int().nonnegative(),
  activeAgentCount: z.number().int().nonnegative(),
  createdAt: timestamp,
  lastUsedAt: timestamp.nullable(),
});

export const AgentSchema = z.object({
  id,
  sessionId: z.string().nullable(),
  workspaceId: id,
  name: z.string().min(1).max(120),
  state: z.enum([
    "starting",
    "idle",
    "running",
    "awaiting-approval",
    "stopping",
    "offline",
    "error",
  ]),
  currentRunId: z.string().nullable(),
  summary: z.string().nullable(),
  createdAt: timestamp,
  lastUsedAt: timestamp,
});

export const DeviceSchema = z.object({
  id,
  name: z.string().min(1),
  platform: z.enum(["android", "web-local"]),
  fingerprint: z.string().min(16),
  state: z.enum(["online", "offline", "revoked"]),
  pairedAt: timestamp,
  lastSeenAt: timestamp.nullable(),
});

export const PairingCodeSchema = z.object({
  id,
  code: z.string().regex(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/),
  endpoint: z.string().url(),
  serverPublicKey: z.string().min(1),
  state: z.enum(["active", "claimed", "expired", "revoked"]),
  createdAt: timestamp,
  expiresAt: timestamp,
});

export const ApprovalSchema = z.object({
  id,
  agentId: id,
  workspaceId: id,
  kind: z.enum(["shell", "file-write", "mcp", "plan"]),
  title: z.string(),
  detail: z.string(),
  state: z.enum(["pending", "approved", "denied", "expired"]),
  requestedAt: timestamp,
  resolvedAt: timestamp.nullable(),
  resolvedByDeviceId: z.string().nullable(),
});

export const ActivityEventSchema = z.object({
  id,
  type: z.enum([
    "server.started",
    "device.paired",
    "device.connected",
    "workspace.created",
    "agent.created",
    "agent.state-changed",
    "approval.requested",
  ]),
  message: z.string(),
  workspaceId: z.string().nullable(),
  agentId: z.string().nullable(),
  deviceId: z.string().nullable(),
  occurredAt: timestamp,
});

export const ProxyGuideSchema = z.object({
  id: z.enum(["caddy", "tailscale", "cloudflare"]),
  name: z.string(),
  description: z.string(),
  difficulty: z.enum(["easy", "moderate", "advanced"]),
  requirements: z.array(z.string()),
  configTemplate: z.string(),
});

export type ServerStatus = z.infer<typeof ServerStatusSchema>;
export type ServerSettings = z.infer<typeof ServerSettingsSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type Device = z.infer<typeof DeviceSchema>;
export type PairingCode = z.infer<typeof PairingCodeSchema>;
export type Approval = z.infer<typeof ApprovalSchema>;
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;
export type ProxyGuide = z.infer<typeof ProxyGuideSchema>;

export const ApiDatabaseSchema = z.object({
  serverStatus: ServerStatusSchema,
  settings: ServerSettingsSchema,
  workspaces: z.array(WorkspaceSchema),
  agents: z.array(AgentSchema),
  devices: z.array(DeviceSchema),
  pairingCodes: z.array(PairingCodeSchema),
  approvals: z.array(ApprovalSchema),
  activityEvents: z.array(ActivityEventSchema),
  proxyGuides: z.array(ProxyGuideSchema),
});

export type ApiDatabase = z.infer<typeof ApiDatabaseSchema>;
