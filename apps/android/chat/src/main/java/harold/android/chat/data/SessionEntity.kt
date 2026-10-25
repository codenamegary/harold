package harold.android.chat.data

import androidx.room.Entity
import harold.android.contracts.AgentId
import harold.android.contracts.Session

@Entity(
    tableName = "sessions",
    primaryKeys = ["serverOrigin", "agentId", "sessionId"],
)
data class SessionEntity(
    val serverOrigin: String,
    val agentId: AgentId,
    val sessionId: String,
    val cwd: String,
    val title: String,
    val updatedAt: String,
    val workspaceId: String,
    val workspaceName: String,
    val agentLabel: String,
)

fun SessionEntity.toSession(): Session = Session(
    agentId = agentId,
    sessionId = sessionId,
    cwd = cwd,
    title = title,
    updatedAt = updatedAt,
)
