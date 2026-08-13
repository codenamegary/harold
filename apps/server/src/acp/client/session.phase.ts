export const sessionPhases = ["live", "load_replay"] as const

export type SessionPhase = (typeof sessionPhases)[number]
