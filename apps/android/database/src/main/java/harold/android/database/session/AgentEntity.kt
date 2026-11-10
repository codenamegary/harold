package harold.android.database.session

import androidx.room.Entity
import harold.android.contracts.AgentId

@Entity(
    tableName = "agents",
    primaryKeys = ["connectionId", "agentId"],
)
data class AgentEntity(
    val connectionId: String,
    val agentId: AgentId,
    val displayName: String,
    val available: Boolean,
    val enabled: Boolean,
    val path: String?,
    val position: Int,
)
