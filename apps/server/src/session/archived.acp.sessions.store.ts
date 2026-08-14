import { AgentId, AgentIdSchema } from "contracts/http/agent-settings"
import { AgentDatabase } from "../persistence/database"
import { archivedAcpSessions } from "../persistence/schema/archived.acp.sessions"

export type ArchivedAcpSessionKey = {
  agentId: AgentId
  sessionId: string
}

const archiveKey = (params: ArchivedAcpSessionKey): string =>
  `${params.agentId}\0${params.sessionId}`

export type ArchivedAcpSessionsStore = {
  isArchived: (params: ArchivedAcpSessionKey) => boolean
  archive: (params: ArchivedAcpSessionKey) => void
}

export const createArchivedAcpSessionsStore = (
  database: AgentDatabase,
): ArchivedAcpSessionsStore => {
  const keys = new Set(
    database.db
      .select()
      .from(archivedAcpSessions)
      .all()
      .map((row) =>
        archiveKey({
          agentId: AgentIdSchema.parse(row.agentId),
          sessionId: row.sessionId,
        }),
      ),
  )

  return {
    isArchived: (params) => keys.has(archiveKey(params)),
    archive: (params) => {
      const key = archiveKey(params)
      if (keys.has(key)) {
        return
      }

      database.db
        .insert(archivedAcpSessions)
        .values({
          agentId: params.agentId,
          sessionId: params.sessionId,
        })
        .onConflictDoNothing()
        .run()

      keys.add(key)
    },
  }
}
