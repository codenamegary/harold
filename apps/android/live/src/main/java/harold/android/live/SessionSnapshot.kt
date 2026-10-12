package harold.android.live

import harold.android.chat.AcpTranscriptState
import harold.android.chat.StreamExtension
import harold.android.chat.emptyAcpTranscript
import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentId
import harold.android.contracts.AvailableCommand
import harold.android.contracts.ConfigOption
import harold.android.contracts.PermissionRequest

data class SessionSnapshot(
    val agentId: AgentId? = null,
    val sessionId: String? = null,
    val transcript: AcpTranscriptState = emptyAcpTranscript,
    val reconnecting: Boolean = false,
    val availableCommands: List<AvailableCommand> = emptyList(),
    val configOptions: List<ConfigOption> = emptyList(),
    val pendingPermission: PermissionRequest? = null,
    val extension: StreamExtension? = null,
    val agentAuth: AgentAuth? = null,
    val authRequired: Boolean = false,
)
