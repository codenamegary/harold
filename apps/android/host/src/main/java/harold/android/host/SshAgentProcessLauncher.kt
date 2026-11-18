package harold.android.host

import harold.android.contracts.LogCleanupPolicy
import harold.android.process.AgentLaunchException
import harold.android.process.AgentProcessChannel
import harold.android.process.AgentProcessLauncher
import harold.android.process.LaunchableAgent
import harold.android.process.TerminalLaunchSpec
import harold.android.transport.ssh.SshConnection
import harold.android.transport.ssh.SshConnectionLease
import harold.android.transport.ssh.SshExecChannel
import harold.android.transport.ssh.SshException
import harold.android.transport.ssh.isExecutable
import harold.android.transport.ssh.runCommand
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Launches a persistent host for each agent and attaches this SSH channel to
 * it. The host owns the agent process and survives channel closure; the
 * returned channel is only the bridge. [stopAgent] ends the host explicitly.
 */
@Singleton
class SshAgentProcessLauncher @Inject constructor(
    private val connections: HostConnections,
) : AgentProcessLauncher {
    private val hostScript: String by lazy { hostAgentScript() }

    override suspend fun launchableAgents(
        connectionId: String,
    ): Result<List<LaunchableAgent>> = runCatching {
        connections.useConnection(connectionId) { connection, store ->
            ensureAgentRows(connection, store)
                .filter { row ->
                    row.enabled &&
                        !row.dismissed &&
                        (row.present || row.path != null || row.binDir != null)
                }
                .map { row ->
                    LaunchableAgent(
                        id = row.id,
                        displayName = agentDisplayName(row.id, row),
                    )
                }
        }
    }

    override suspend fun keyFor(connectionId: String): String =
        connections.key(connectionId)

    override suspend fun launchAgent(
        connectionId: String,
        agentId: String,
    ): Result<AgentProcessChannel> = runCatching {
        val connection = connect(connectionId)
        try {
            val home = connection.realPath(".")
            val store = SshSessionStore(connection, home)
            val launch = agentCommand(connection, store, agentId)
            val exec = connection.exec(
                hostAgentCommand(
                    script = hostScript,
                    mode = "connect",
                    agentId = agentId,
                    command = launch.command,
                    offset = LIVE_OFFSET,
                ),
            )
            SshAgentProcessChannel(exec, connection, launch.label)
        } catch (error: Throwable) {
            connection.close()
            throw error
        }
    }

    /**
     * Stops the detached host. Closing an attach channel only closes the SSH
     * bridge, so an explicit restart or connection removal calls this first.
     */
    override suspend fun stopAgent(
        connectionId: String,
        agentId: String,
    ): Result<Unit> = runCatching {
        connections.useConnection(connectionId) { connection, _ ->
            val result = connection.runCommand(
                hostAgentCommand(
                    script = hostScript,
                    mode = "stop",
                    agentId = agentId,
                    command = "",
                    offset = 0,
                ),
            )
            if (!result.succeeded) {
                throw SshException(
                    result.stderr.trim().ifBlank { "Could not stop $agentId on the host." },
                )
            }
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

    private suspend fun connect(connectionId: String): SshConnectionLease =
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
        val command = agentLaunchInnerCommand(
            binary = binary,
            args = args,
            binDir = row?.binDir?.takeIf { dir -> dir.isNotBlank() },
        )
        return AgentLaunch(
            label = label,
            command = command,
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
        private val connection: SshConnectionLease,
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

/**
 * The app sends the host script inline, so the host needs no installed file.
 * `HAROLD_AGENT_SCRIPT` is expanded into `sh -c` once in the connect process
 * and again into the detached host's argv. Nothing is written to disk.
 */
internal fun hostAgentCommand(
    script: String,
    mode: String,
    agentId: String,
    command: String,
    offset: Int,
): String {
    val arguments = buildString {
        append(" harold-agent ")
        append(mode)
        append(' ')
        append(SshSessionStore.shellQuote(agentId))
        if (command.isNotBlank()) {
            append(' ')
            append(SshSessionStore.shellQuote(command))
        }
        if (mode == "connect") {
            append(' ')
            append(offset)
        }
    }
    return hostScriptCommand(script, arguments)
}

/** Lists every run for every agent on the host. */
internal fun hostLogsCommand(script: String): String =
    hostScriptCommand(script, " harold-agent logs")

/** Deletes whole run directories according to [policy]. */
internal fun hostCleanupCommand(
    script: String,
    policy: LogCleanupPolicy,
): String = hostScriptCommand(
    script,
    " harold-agent cleanup " + SshSessionStore.shellQuote(policy.wireValue),
)

/**
 * Prints usage records from one agent's logs. A full scan covers every run.
 * The latest variant resumes the newest run at [knownOffset] when [knownRunId]
 * still matches, so a refresh reads only bytes the previous scan missed.
 */
internal fun hostUsageCommand(
    script: String,
    agentId: String,
    latest: Boolean = false,
    knownRunId: String? = null,
    knownOffset: Long? = null,
): String {
    val arguments = buildString {
        append(" harold-agent usage ")
        append(SshSessionStore.shellQuote(agentId))
        if (latest) {
            append(" latest")
            if (!knownRunId.isNullOrBlank()) {
                append(' ')
                append(SshSessionStore.shellQuote(knownRunId))
                if (knownOffset != null) {
                    append(' ')
                    append(knownOffset)
                }
            }
        }
    }
    return hostScriptCommand(script, arguments)
}

private fun hostScriptCommand(script: String, arguments: String): String = buildString {
    append("export HAROLD_AGENT_SCRIPT=")
    append(SshSessionStore.shellQuote(script))
    append("; exec sh -c ")
    append(SshSessionStore.shellQuote("eval \"\$HAROLD_AGENT_SCRIPT\""))
    append(arguments)
}

/** Loads the one host script packaged with the app. */
internal fun hostAgentScript(): String =
    checkNotNull(
        SshAgentProcessLauncher::class.java.classLoader
            ?.getResourceAsStream(HOST_SCRIPT_RESOURCE),
    ) {
        "Missing packaged host script: $HOST_SCRIPT_RESOURCE"
    }.use { stream -> stream.bufferedReader().readText() }

/**
 * Builds the agent command that runs inside the host's login shell. A chosen
 * bin directory is prepended to PATH after the profile runs, so the agent, its
 * package runner, and any child processes all use the same runtime.
 */
internal fun agentLaunchInnerCommand(
    binary: String,
    args: List<String>,
    binDir: String?,
): String {
    val exec = "exec " + (listOf(binary) + args)
        .joinToString(" ") { token -> SshSessionStore.shellQuote(token) }
    val dir = binDir?.takeIf { value -> value.isNotBlank() } ?: return exec
    return "export PATH=${SshSessionStore.shellQuote(dir)}:\"\$PATH\"; $exec"
}

private const val HOST_SCRIPT_RESOURCE = "harold-agent.sh"

/** -1 means follow only new output; the host initialize line is still replayed. */
internal const val LIVE_OFFSET = -1
