import { AgentIdSchema } from "contracts/http/agent-settings"
import { AgentDatabase } from "../persistence/database"
import { archivedAcpSessions } from "../persistence/schema/archived.acp.sessions"
import { ArchiveAcpSession, ArchivedAcpSessionKey, IsArchivedAcpSession } from "./session.ports"

export type ArchivedAcpSessionsStore = Readonly<{
  isArchived: IsArchivedAcpSession
  archive: ArchiveAcpSession
}>

const archiveKey = (params: ArchivedAcpSessionKey): string =>
  `${params.agentId}\0${params.sessionId}`

export const makeArchivedAcpSessionsStore = (database: AgentDatabase): ArchivedAcpSessionsStore => {
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
