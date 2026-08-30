package server.agent.android.live

import server.agent.android.chat.AcpTranscriptState
import server.agent.android.chat.StreamExtension
import server.agent.android.chat.emptyAcpTranscript
import server.agent.android.contracts.AgentAuth
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.AvailableCommand
import server.agent.android.contracts.PermissionRequest

data class SessionSnapshot(
    val agentId: AgentId? = null,
    val sessionId: String? = null,
    val transcript: AcpTranscriptState = emptyAcpTranscript,
    val reconnecting: Boolean = false,
    val availableCommands: List<AvailableCommand> = emptyList(),
    val pendingPermission: PermissionRequest? = null,
    val extension: StreamExtension? = null,
    val agentAuth: AgentAuth? = null,
    val authRequired: Boolean = false,
)
