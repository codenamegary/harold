package harold.android.chat

import harold.android.contracts.AgentId
import harold.android.contracts.CreateSessionResponse
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

sealed interface SessionCommand {
    data class Open(val row: SessionRow) : SessionCommand

    data class Created(val response: CreateSessionResponse) : SessionCommand

    data class Pending(val workspace: WorkspaceRow, val agentId: AgentId) : SessionCommand

    data class Deleted(val row: SessionRow) : SessionCommand
}

interface SessionCommands {
    val commands: SharedFlow<SessionCommand>

    fun emit(command: SessionCommand)
}

class DefaultSessionCommands @Inject constructor() : SessionCommands {
    private val _commands = MutableSharedFlow<SessionCommand>(extraBufferCapacity = 16)
    override val commands: SharedFlow<SessionCommand> = _commands.asSharedFlow()

    override fun emit(command: SessionCommand) {
        check(_commands.tryEmit(command)) {
            "Session command was dropped"
        }
    }
}
