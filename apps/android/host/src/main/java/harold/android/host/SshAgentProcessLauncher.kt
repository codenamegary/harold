package harold.android.host

import harold.android.process.AgentLaunchException
import harold.android.process.AgentProcessChannel
import harold.android.process.AgentProcessLauncher
import harold.android.process.LaunchableAgent
import harold.android.process.TerminalLaunchSpec
import harold.android.transport.ssh.SshConnection
import harold.android.transport.ssh.SshExecChannel
import harold.android.transport.ssh.SshException
import harold.android.transport.ssh.isExecutable
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Launches one host process per call. The wrapper owns the SSH connection it
 * opened, so closing the channel releases both the process and its session.
 */
@Singleton
class SshAgentProcessLauncher @Inject constructor(
    private val connections: HostConnections,
) : AgentProcessLauncher {
    override suspend fun launchableAgents(
        connectionId: String,
    ): Result<List<LaunchableAgent>> = runCatching {
        connections.useConnection(connectionId) { connection, store ->
            ensureAgentRows(connection, store)
                .filter { row -> row.enabled && !row.dismissed && (row.present || row.path != null) }
                .map { row ->
                    LaunchableAgent(
                        id = row.id,
                        displayName = agentDisplayName(row.id, row),
                    )
                }
        }
    }

    override suspend fun launchAgent(
        connectionId: String,
        agentId: String,
    ): Result<AgentProcessChannel> = runCatching {
        val connection = connect(connectionId)
        try {
            val home = connection.realPath(".")
            val store = SshSessionStore(connection, home)
            val launch = agentCommand(connection, store, agentId)
            val exec = connection.exec(launch.command)
            SshAgentProcessChannel(exec, connection, launch.label)
        } catch (error: Throwable) {
            connection.close()
            throw error
        }
    }

    override suspend fun launchTerminal(
        connectionId: String,
        spec: TerminalLaunchSpec,
    ): Result<AgentProcessChannel> = runCatching {
        val connection = connect(connectionId)
        try {
            val exec = connection.exec(commandLine(spec))
            SshAgentProcessChannel(exec, connection, spec.command)
        } catch (error: Throwable) {
            connection.close()
            throw error
        }
    }

    private suspend fun connect(connectionId: String): SshConnection =
        connections.open(connectionId)

    private suspend fun ensureAgentRows(
        connection: SshConnection,
        store: SshSessionStore,
    ): List<HostAgentConfigRow> {
        store.readAgentsConfig()?.let { rows -> return rows }
        val scanned = scanAgentRows(connection, emptyList())
        store.writeAgentsConfig(scanned)
        return scanned
    }

    /**
     * Builds the launch command from the agent's saved settings:
     * `<path or known binary> <args...>`. A disabled or dismissed agent
     * cannot start. A saved path that no longer runs fails before the SSH
     * exec with a message that names the path.
     */
    private suspend fun agentCommand(
        connection: SshConnection,
        store: SshSessionStore,
        agentId: String,
    ): AgentLaunch = agentCommand(
        connection = connection,
        row = store.agentsConfig().find { it.id == agentId },
        agentId = agentId,
    )

    private suspend fun agentCommand(
        connection: SshConnection,
        row: HostAgentConfigRow?,
        agentId: String,
    ): AgentLaunch {
        if (row?.dismissed == true) {
            throw SshException("$agentId was removed from this host's agent list.")
        }
        if (row?.enabled == false) {
            throw SshException("$agentId is disabled. Enable it in the Agents screen.")
        }
        val label = agentDisplayName(agentId, row)
        val explicitPath = row?.path?.takeIf { path -> path.isNotBlank() }
        if (explicitPath != null && !connection.isExecutable(explicitPath)) {
            throw AgentLaunchException(
                "$label is not executable at $explicitPath. " +
                    "Update its path in Agents or rescan the host.",
            )
        }
        val known = knownAgent(agentId)
        val binary = explicitPath
            ?: known?.command?.firstOrNull()
            ?: agentId
        val args = if (explicitPath != null) {
            row.args
        } else {
            known?.command?.drop(1).orEmpty()
        }
        val command = "exec " + (listOf(binary) + args)
            .joinToString(" ") { token -> SshSessionStore.shellQuote(token) }
        return AgentLaunch(
            label = label,
            command = "exec bash -lc ${SshSessionStore.shellQuote(command)}",
        )
    }

    private fun commandLine(spec: TerminalLaunchSpec): String {
        val cwd = spec.cwd
        val script = buildString {
            if (cwd != null) {
                append("cd ")
                append(SshSessionStore.shellQuote(cwd))
                append(" && ")
            }
            if (spec.env.isNotEmpty()) {
                append("env ")
                spec.env.forEach { (name, value) ->
                    append(name)
                    append('=')
                    append(SshSessionStore.shellQuote(value))
                    append(' ')
                }
            }
            append("exec ")
            append(SshSessionStore.shellQuote(spec.command))
            spec.args.forEach { arg ->
                append(' ')
                append(SshSessionStore.shellQuote(arg))
            }
        }
        return "exec bash -lc ${SshSessionStore.shellQuote(script)}"
    }

    private data class AgentLaunch(
        val label: String,
        val command: String,
    )

    private class SshAgentProcessChannel(
        private val exec: SshExecChannel,
        private val connection: SshConnection,
        override val label: String,
    ) : AgentProcessChannel {
        override val stdin get() = exec.stdin
        override val stdout get() = exec.stdout

        override fun stderrText(): String = exec.stderrText()

        override fun isClosed(): Boolean = exec.isClosed()

        override suspend fun awaitExit(): Int = exec.awaitExit()

        override fun close() {
            exec.close()
            connection.close()
        }
    }
}
