package harold.android.chat

import harold.android.contracts.AgentId
import harold.android.contracts.CreateSessionResponse
import javax.inject.Inject
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow

sealed interface SessionCommand {
    data class Open(val row: SessionRow) : SessionCommand

    data class Created(val response: CreateSessionResponse) : SessionCommand

    data class Pending(val workspace: WorkspaceRow, val agentId: AgentId) : SessionCommand

    data class Deleted(val row: SessionRow) : SessionCommand
}

/**
 * One-shot commands from the session routes to Chat. Each command is delivered
 * once. Commands sent before Chat collects wait in the channel.
 */
interface SessionCommands {
    val commands: Flow<SessionCommand>

    fun emit(command: SessionCommand)
}

class DefaultSessionCommands @Inject constructor() : SessionCommands {
    private val channel = Channel<SessionCommand>(Channel.UNLIMITED)
    override val commands: Flow<SessionCommand> = channel.receiveAsFlow()

    override fun emit(command: SessionCommand) {
        check(channel.trySend(command).isSuccess) {
            "Session command channel is closed"
        }
    }
}
