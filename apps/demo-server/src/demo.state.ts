import { randomUUID } from "node:crypto"
import {
  MAX_ACTIVE_DEVICES,
  MAX_SESSIONS_PER_DEVICE,
  SESSION_TTL_MS,
} from "./fixtures/demo.constants"
import { defaultConfigValues, DemoConfigValue } from "./fixtures/config.options"
import { createSeedSessions } from "./fixtures/sessions"
import { createWorkspaceFixtures, DemoWorkspaceFixture } from "./fixtures/workspaces"
import { DemoAttachmentDescriptor } from "./fixtures/attachments"
import { DemoServerFrame } from "./sse/frames"
import { cancelledFrame } from "./sse/frames"

export type DemoDevice = {
  id: string
  name: string
  platform: string | null
  state: "online" | "offline"
  pairedAt: string
  lastSeenAt: string | null
}

export type DemoWorkspace = DemoWorkspaceFixture

export type DemoTurnRecord = {
  number: number
  kind: "full" | "canned"
  cannedIndex: number | null
  status: "running" | "completed" | "cancelled"
  permissionOptionId: string | null
  elicitationRequestId: string | null
  elicitationAccepted: boolean | null
  extensionRequestId: string | null
  extensionReplied: boolean | null
}

export type DemoActiveTurn = {
  number: number
  cancelled: boolean
  pendingRequestId: string | null
}

export type DemoSession = {
  id: string
  workspaceId: string
  agentId: string
  title: string
  cwd: string
  worktreePath: string | null
  createdAt: string
  updatedAt: string
  expiresAt: number
  seeded: boolean
  turns: DemoTurnRecord[]
  configValues: Map<string, DemoConfigValue>
  attachments: Map<string, DemoAttachmentDescriptor>
  activeTurn: DemoActiveTurn | null
}

export type DemoSubscriber = {
  id: string
  deviceId: string
  sessionId: string
  send: (frame: DemoServerFrame) => void
  close: () => void
}

type PendingReplyKind = "permission" | "elicitation" | "extension"

export type DemoReplyValue = {
  optionId?: string
  cancelled?: boolean
}

type PendingReply = {
  requestId: string
  deviceId: string
  sessionId: string
  kind: PendingReplyKind
  resolve: (value: DemoReplyValue) => void
}

export type DemoDeviceState = {
  device: DemoDevice
  createdAt: number
  expiresAt: number
  workspaces: Map<string, DemoWorkspace>
  sessions: Map<string, DemoSession>
  extraDirectories: Set<string>
  subscribers: Set<DemoSubscriber>
}

export type EnsureDeviceResult =
  | { ok: true; state: DemoDeviceState }
  | { ok: false; reason: "device_limit" }

export type CreateSessionResult =
  | { ok: true; session: DemoSession }
  | { ok: false; reason: "not_found" | "session_limit" }

export type ResolveReplyResult = "settled" | "already_settled" | "unknown"

export type DemoStore = {
  readonly now: () => number
  ensureDevice: (deviceId: string) => EnsureDeviceResult
  getDevice: (deviceId: string) => DemoDeviceState | undefined
  touchDevice: (deviceId: string) => void
  reap: () => void
  listSessions: (deviceId: string, cwd?: string) => ReadonlyArray<DemoSession>
  getSession: (deviceId: string, sessionId: string) => DemoSession | undefined
  createSession: (params: { deviceId: string; agentId: string; cwd: string }) => CreateSessionResult
  deleteSession: (deviceId: string, sessionId: string) => boolean
  removeDevice: (deviceId: string) => boolean
  addSubscriber: (subscriber: DemoSubscriber) => void
  removeSubscriber: (deviceId: string, subscriberId: string) => void
  hasSubscribers: (deviceId: string, sessionId: string) => boolean
  broadcast: (deviceId: string, sessionId: string, frame: DemoServerFrame) => void
  closeSessionStreams: (deviceId: string, sessionId: string, frame?: DemoServerFrame) => void
  beginTurn: (deviceId: string, sessionId: string, turn: DemoTurnRecord) => boolean
  endTurn: (deviceId: string, sessionId: string) => void
  cancelTurn: (deviceId: string, sessionId: string) => boolean
  registerPendingReply: (params: {
    requestId: string
    deviceId: string
    sessionId: string
    kind: PendingReplyKind
    resolve: (value: DemoReplyValue) => void
  }) => void
  resolvePendingReply: (params: {
    requestId: string
    deviceId: string
    kind: PendingReplyKind
    value: DemoReplyValue
  }) => ResolveReplyResult
  forgetPendingReply: (requestId: string) => void
  hasPendingReply: (requestId: string) => boolean
  deviceCount: () => number
}

type CreateDemoStoreOptions = {
  now?: () => number
  maxDevices?: number
  maxSessionsPerDevice?: number
}

const iso = (ms: number): string => new Date(ms).toISOString()

export const createDemoStore = (options: CreateDemoStoreOptions = {}): DemoStore => {
  const now = options.now ?? (() => Date.now())
  const maxDevices = options.maxDevices ?? MAX_ACTIVE_DEVICES
  const maxSessionsPerDevice = options.maxSessionsPerDevice ?? MAX_SESSIONS_PER_DEVICE
  const devices = new Map<string, DemoDeviceState>()
  const subscribers = new Map<string, DemoSubscriber>()
  const pendingReplies = new Map<string, PendingReply>()
  const settledRequestIds = new Set<string>()

  const markSettled = (requestId: string): void => {
    settledRequestIds.add(requestId)
    if (settledRequestIds.size > 1_000) {
      const first = settledRequestIds.values().next().value
      if (first !== undefined) {
        settledRequestIds.delete(first)
      }
    }
  }

  const closeSubscribersForSession = (
    state: DemoDeviceState,
    sessionId: string,
    frame?: DemoServerFrame,
  ): void => {
    const doomed = [...state.subscribers].filter((subscriber) => subscriber.sessionId === sessionId)
    for (const subscriber of doomed) {
      if (frame !== undefined) {
        subscriber.send(frame)
      }
      subscriber.close()
      subscribers.delete(subscriber.id)
      state.subscribers.delete(subscriber)
    }
  }

  const settlePendingForSession = (sessionId: string): void => {
    for (const pending of Array.from(pendingReplies.values())) {
      if (pending.sessionId !== sessionId) {
        continue
      }
      pendingReplies.delete(pending.requestId)
      markSettled(pending.requestId)
      pending.resolve({ cancelled: true })
    }
  }

  const removeSession = (
    state: DemoDeviceState,
    sessionId: string,
    emitCancelled: boolean,
  ): void => {
    const session = state.sessions.get(sessionId)
    settlePendingForSession(sessionId)
    closeSubscribersForSession(
      state,
      sessionId,
      emitCancelled ? cancelledFrame(session?.agentId ?? "opencode", sessionId) : undefined,
    )
    state.sessions.delete(sessionId)
  }

  const removeDevice = (state: DemoDeviceState): void => {
    for (const session of Array.from(state.sessions.values())) {
      removeSession(state, session.id, true)
    }
    for (const subscriber of state.subscribers) {
      subscriber.close()
      subscribers.delete(subscriber.id)
    }
    state.subscribers.clear()
    devices.delete(state.device.id)
  }

  const seedDevice = (deviceId: string, nowMs: number): DemoDeviceState => {
    const workspaces = new Map<string, DemoWorkspace>()
    for (const workspace of createWorkspaceFixtures(nowMs)) {
      workspaces.set(workspace.id, workspace)
    }

    const sessions = new Map<string, DemoSession>()
    for (const seed of createSeedSessions(nowMs)) {
      sessions.set(seed.id, {
        ...seed,
        agentId: "opencode",
        expiresAt: nowMs + SESSION_TTL_MS,
        seeded: true,
        turns: [],
        configValues: defaultConfigValues(),
        attachments: new Map(),
        activeTurn: null,
      })
    }

    const state: DemoDeviceState = {
      device: {
        id: deviceId,
        name: "Demo device",
        platform: "android",
        state: "online",
        pairedAt: iso(nowMs),
        lastSeenAt: iso(nowMs),
      },
      createdAt: nowMs,
      expiresAt: nowMs + SESSION_TTL_MS,
      workspaces,
      sessions,
      extraDirectories: new Set(),
      subscribers: new Set(),
    }
    devices.set(deviceId, state)
    return state
  }

  const reapDevice = (state: DemoDeviceState, nowMs: number): void => {
    for (const session of Array.from(state.sessions.values())) {
      if (session.expiresAt <= nowMs) {
        removeSession(state, session.id, true)
      }
    }

    if (state.sessions.size === 0 && state.expiresAt <= nowMs) {
      removeDevice(state)
    }
  }

  const reap = (): void => {
    const nowMs = now()
    for (const state of Array.from(devices.values())) {
      reapDevice(state, nowMs)
    }
  }

  const ensureDevice = (deviceId: string): EnsureDeviceResult => {
    const nowMs = now()
    const existing = devices.get(deviceId)
    if (existing !== undefined) {
      reapDevice(existing, nowMs)
      const current = devices.get(deviceId)
      if (current !== undefined) {
        current.device.lastSeenAt = iso(nowMs)
        return { ok: true, state: current }
      }
    }

    reap()
    if (devices.size >= maxDevices) {
      return { ok: false, reason: "device_limit" }
    }

    return { ok: true, state: seedDevice(deviceId, nowMs) }
  }

  const getDevice = (deviceId: string): DemoDeviceState | undefined => {
    const state = devices.get(deviceId)
    if (state !== undefined) {
      reapDevice(state, now())
    }
    return devices.get(deviceId)
  }

  const touchDevice = (deviceId: string): void => {
    const state = devices.get(deviceId)
    if (state !== undefined) {
      state.device.lastSeenAt = iso(now())
    }
  }

  const getSession = (deviceId: string, sessionId: string): DemoSession | undefined => {
    const state = getDevice(deviceId)
    if (state === undefined) {
      return undefined
    }
    const session = state.sessions.get(sessionId)
    if (session === undefined || session.expiresAt <= now()) {
      return undefined
    }
    return session
  }

  const listSessions = (deviceId: string, cwd?: string): ReadonlyArray<DemoSession> => {
    const state = getDevice(deviceId)
    if (state === undefined) {
      return []
    }
    const rows = [...state.sessions.values()].filter((session) => session.expiresAt > now())
    const filtered = cwd === undefined ? rows : rows.filter((session) => session.cwd === cwd)
    return filtered.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  const createSession = (params: {
    deviceId: string
    agentId: string
    cwd: string
  }): CreateSessionResult => {
    const device = getDevice(params.deviceId)
    if (device === undefined) {
      return { ok: false, reason: "not_found" }
    }
    if (device.sessions.size >= maxSessionsPerDevice) {
      return { ok: false, reason: "session_limit" }
    }

    const nowMs = now()
    const session: DemoSession = {
      id: `ses_demo_${randomUUID()}`,
      workspaceId:
        [...device.workspaces.values()].find((workspace) => workspace.path === params.cwd)?.id ??
        "",
      agentId: params.agentId,
      title: "New demo session",
      cwd: params.cwd,
      worktreePath: null,
      createdAt: iso(nowMs),
      updatedAt: iso(nowMs),
      expiresAt: nowMs + SESSION_TTL_MS,
      seeded: false,
      turns: [],
      configValues: defaultConfigValues(),
      attachments: new Map(),
      activeTurn: null,
    }
    device.sessions.set(session.id, session)
    return { ok: true, session }
  }

  const deleteSession = (deviceId: string, sessionId: string): boolean => {
    const state = getDevice(deviceId)
    if (state === undefined || !state.sessions.has(sessionId)) {
      return false
    }
    removeSession(state, sessionId, true)
    return true
  }

  const removeDeviceById = (deviceId: string): boolean => {
    const state = devices.get(deviceId)
    if (state === undefined) {
      return false
    }
    removeDevice(state)
    return true
  }

  const addSubscriber = (subscriber: DemoSubscriber): void => {
    const state = devices.get(subscriber.deviceId)
    if (state === undefined) {
      return
    }
    state.subscribers.add(subscriber)
    subscribers.set(subscriber.id, subscriber)
  }

  const removeSubscriber = (deviceId: string, subscriberId: string): void => {
    const state = devices.get(deviceId)
    const subscriber = subscribers.get(subscriberId)
    subscribers.delete(subscriberId)
    if (state !== undefined && subscriber !== undefined) {
      state.subscribers.delete(subscriber)
    }
  }

  const hasSubscribers = (deviceId: string, sessionId: string): boolean => {
    const state = devices.get(deviceId)
    if (state === undefined) {
      return false
    }
    return [...state.subscribers].some((subscriber) => subscriber.sessionId === sessionId)
  }

  const broadcast = (deviceId: string, sessionId: string, frame: DemoServerFrame): void => {
    const state = devices.get(deviceId)
    if (state === undefined) {
      return
    }
    for (const subscriber of Array.from(state.subscribers)) {
      if (subscriber.sessionId === sessionId) {
        subscriber.send(frame)
      }
    }
  }

  const closeSessionStreams = (
    deviceId: string,
    sessionId: string,
    frame?: DemoServerFrame,
  ): void => {
    const state = devices.get(deviceId)
    if (state === undefined) {
      return
    }
    closeSubscribersForSession(state, sessionId, frame)
  }

  const beginTurn = (deviceId: string, sessionId: string, turn: DemoTurnRecord): boolean => {
    const session = getSession(deviceId, sessionId)
    if (session === undefined || session.activeTurn !== null) {
      return false
    }
    session.activeTurn = {
      number: turn.number,
      cancelled: false,
      pendingRequestId: null,
    }
    session.turns.push(turn)
    return true
  }

  const endTurn = (deviceId: string, sessionId: string): void => {
    const session = getSession(deviceId, sessionId)
    if (session !== undefined) {
      session.activeTurn = null
    }
  }

  const cancelTurn = (deviceId: string, sessionId: string): boolean => {
    const session = getSession(deviceId, sessionId)
    if (session === undefined || session.activeTurn === null) {
      return false
    }
    const active = session.activeTurn
    active.cancelled = true
    const pendingRequestId = active.pendingRequestId
    if (pendingRequestId !== null) {
      const pending = pendingReplies.get(pendingRequestId)
      if (pending !== undefined) {
        pendingReplies.delete(pendingRequestId)
        markSettled(pendingRequestId)
        pending.resolve({ cancelled: true })
      }
      active.pendingRequestId = null
    }
    return true
  }

  const registerPendingReply = (params: {
    requestId: string
    deviceId: string
    sessionId: string
    kind: PendingReplyKind
    resolve: (value: DemoReplyValue) => void
  }): void => {
    settledRequestIds.delete(params.requestId)
    pendingReplies.set(params.requestId, params)
    const session = devices.get(params.deviceId)?.sessions.get(params.sessionId)
    if (session?.activeTurn != null) {
      session.activeTurn.pendingRequestId = params.requestId
    }
  }

  const resolvePendingReply = (params: {
    requestId: string
    deviceId: string
    kind: PendingReplyKind
    value: DemoReplyValue
  }): ResolveReplyResult => {
    const pending = pendingReplies.get(params.requestId)
    if (pending === undefined) {
      return settledRequestIds.has(params.requestId) ? "already_settled" : "unknown"
    }
    if (pending.deviceId !== params.deviceId || pending.kind !== params.kind) {
      return "unknown"
    }

    pendingReplies.delete(params.requestId)
    markSettled(params.requestId)
    const session = devices.get(params.deviceId)?.sessions.get(pending.sessionId)
    if (session?.activeTurn?.pendingRequestId === params.requestId) {
      session.activeTurn.pendingRequestId = null
    }
    pending.resolve(params.value)
    return "settled"
  }

  return {
    now,
    ensureDevice,
    getDevice,
    touchDevice,
    reap,
    listSessions,
    getSession,
    createSession,
    deleteSession,
    removeDevice: removeDeviceById,
    addSubscriber,
    removeSubscriber,
    hasSubscribers,
    broadcast,
    closeSessionStreams,
    beginTurn,
    endTurn,
    cancelTurn,
    registerPendingReply,
    resolvePendingReply,
    forgetPendingReply: (requestId) => {
      pendingReplies.delete(requestId)
    },
    hasPendingReply: (requestId) => pendingReplies.has(requestId),
    deviceCount: () => devices.size,
  }
}
