package harold.android.host

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.CreateCustomAgentBody
import harold.android.contracts.UpdateAgentBody
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.network.AgentAuthApi
import harold.android.network.AgentAuthCache
import harold.android.network.AgentSettingsApi
import harold.android.network.hostLoginInstructions
import harold.android.process.AgentAuthRequiredException
import harold.android.process.AgentLaunchException
import harold.android.process.AgentProcessRestarter
import harold.android.transport.ssh.SshConnection
import harold.android.transport.ssh.SshException
import harold.android.transport.ssh.isExecutable
import harold.android.transport.ssh.runCommand
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/** Agent catalog and sign-in state stored under `~/.harold` on the host. */
@Singleton
class HostAgentApi @Inject constructor(
    private val connections: HostConnections,
    private val authCache: AgentAuthCache,
    private val restarter: AgentProcessRestarter,
) : AgentSettingsApi, AgentAuthApi {
    private val unknownAuth = AgentAuthSummary(
        status = AgentAuthStatus.Unknown,
        error = null,
        activeSessionId = null,
        canLogout = false,
    )

    override suspend fun listAgents(connectionId: String): Result<AgentSettingsCollection> = hostCall {
        connections.useConnection(connectionId) { connection, store ->
            val firstScan = store.readAgentsConfig() == null
            val rows = if (firstScan) {
                // Detection runs on first connect and on an explicit scan —
                // never silently on every connect.
                val scanned = scanPresence(connection, emptyList())
                store.writeAgentsConfig(scanned)
                scanned
            } else {
                store.agentsConfig()
            }
            agentCollection(connection, connectionId, rows)
        }
    }

    override suspend fun scanAgents(connectionId: String): Result<AgentSettingsCollection> = hostCall {
        connections.useConnection(connectionId) { connection, store ->
            val rows = scanPresence(connection, store.agentsConfig())
            store.writeAgentsConfig(rows)
            agentCollection(connection, connectionId, rows)
        }
    }

    override suspend fun updateAgent(
        connectionId: String,
        agentId: AgentId,
        body: UpdateAgentBody,
    ): Result<AgentSettings> = hostCall {
        connections.useConnection(connectionId) { connection, store ->
            val existingRows = store.agentsConfig()
            val row = existingRows.find { it.id == agentId }
                ?: knownAgent(agentId)?.let { known ->
                    // Known agent not yet saved to config; seed it
                    HostAgentConfigRow(
                        id = known.id,
                        path = null,
                        args = known.command.drop(1),
                        enabled = false,
                        present = false,
                        updatedAt = Instant.now().toString(),
                    )
                }
                ?: throw SshException("Unknown agent: $agentId. Scan the host first.")
            val newPath = body.path
            newPath?.takeIf { it.isNotBlank() }?.let { path ->
                if (!connection.isExecutable(path)) {
                    throw SshException("That path is not an executable file on the host: $path")
                }
            }
            val updated = row.copy(
                displayName = body.displayName ?: row.displayName,
                path = if (newPath != null) newPath.ifBlank { null } else row.path,
                args = body.args ?: row.args,
                enabled = body.enabled ?: row.enabled,
                dismissed = body.dismissed ?: row.dismissed,
                present = if (newPath?.isNotBlank() == true) true else row.present,
                updatedAt = Instant.now().toString(),
            )
            store.updateAgentsConfig { rows ->
                if (rows.any { it.id == agentId }) {
                    rows.map { if (it.id == agentId) updated else it }
                } else {
                    rows + updated
                }
            }
            agentCollection(connection, connectionId, store.agentsConfig())
                .items.find { it.id == agentId }
                ?: throw SshException("Agent row vanished while saving.")
        }
    }

    override suspend fun createCustomAgent(
        connectionId: String,
        body: CreateCustomAgentBody,
    ): Result<AgentSettings> = hostCall {
        connections.useConnection(connectionId) { connection, store ->
            val path = body.path.trim()
            if (path.isEmpty()) {
                throw SshException("A custom agent needs a path to its executable.")
            }
            if (!connection.isExecutable(path)) {
                throw SshException("That path is not an executable file on the host: $path")
            }
            val rows = store.agentsConfig()
            val row = HostAgentConfigRow(
                id = allocateCustomAgentId(body.displayName, rows),
                displayName = body.displayName.ifBlank { allocateCustomDisplayName(rows) },
                path = path,
                args = body.args,
                enabled = true,
                dismissed = false,
                custom = true,
                present = true,
                updatedAt = Instant.now().toString(),
            )
            store.writeAgentsConfig(rows + row)
            agentCollection(connection, connectionId, store.agentsConfig())
                .items.find { it.id == row.id }
                ?: throw SshException("Agent row vanished while saving.")
        }
    }

    override suspend fun deleteAgent(connectionId: String, agentId: AgentId): Result<Unit> = hostCall {
        connections.useConnection(connectionId) { _, store ->
            val known = knownAgent(agentId) != null
            store.updateAgentsConfig { rows ->
                if (known) {
                    // Known agents keep a tombstone so rescans do not
                    // resurrect them. User-owned fields stay untouched.
                    val now = Instant.now().toString()
                    if (rows.any { row -> row.id == agentId }) {
                        rows.map { current ->
                            if (current.id == agentId) {
                                current.copy(dismissed = true, updatedAt = now)
                            } else {
                                current
                            }
                        }
                    } else {
                        // The agent was not detected on this host yet, but
                        // its row is still visible in the catalog. Write the
                        // tombstone now so a later scan cannot add it back.
                        rows + HostAgentConfigRow(
                            id = agentId,
                            enabled = false,
                            dismissed = true,
                            present = false,
                            updatedAt = now,
                        )
                    }
                } else {
                    // Custom agents delete outright.
                    rows.filterNot { it.id == agentId }
                }
            }
            restarter.restartAgent(connectionId, agentId).getOrThrow()
        }
    }

    override suspend fun reloadConfig(connectionId: String): Result<AgentSettingsCollection> = hostCall {
        connections.useConnection(connectionId) { connection, store ->
            authCache.clear()
            agentCollection(connection, connectionId, store.agentsConfig())
        }
    }

    override suspend fun getAgentAuth(
        connectionId: String,
        agentId: AgentId,
    ): Result<AgentAuth> = hostCall {
        connections.useConnection(connectionId) { connection, _ ->
            val summary = authCache.get(connectionId, agentId)
                ?: probeAgentAuth(connection, connectionId, agentId).summary()
            AgentAuth(
                agentId = agentId,
                status = summary.status,
                error = summary.error,
                session = null,
            )
        }
    }

    override suspend fun logoutAgentAuth(
        connectionId: String,
        agentId: AgentId,
    ): Result<AgentAuthSummary> = hostCall {
        connections.useConnection(connectionId) { connection, _ ->
            val adapter = AgentAuthAdapters.resolve(agentId)
                ?: throw AgentApiException(
                    AgentApiError.Problem(
                        status = 501,
                        title = "Not available",
                        detail = "This agent manages its sign-in on the host. " +
                            "Log out through the agent CLI there.",
                    ),
                )
            connection.runCommand(
                "exec bash -lc ${SshSessionStore.shellQuote(adapter.logoutCommand)}",
            )
            authCache.invalidate(connectionId, agentId)
            probeAgentAuth(connection, connectionId, agentId).summary()
        }
    }

    private suspend fun scanPresence(
        connection: SshConnection,
        existing: List<HostAgentConfigRow>,
    ): List<HostAgentConfigRow> = scanAgentRows(connection, existing)

    private suspend fun agentCollection(
        connection: SshConnection,
        connectionId: String,
        rows: List<HostAgentConfigRow>,
    ): AgentSettingsCollection {
        val authById = authSummaries(connection, connectionId, rows)
        return AgentSettingsCollection(items = agentSettingsView(rows) { id -> authById[id] ?: unknownAuth })
    }

    /** Probes sign-in state for the agents a CLI can actually report on, with a TTL cache. */
    private suspend fun authSummaries(
        connection: SshConnection,
        connectionId: String,
        rows: List<HostAgentConfigRow>,
    ): Map<AgentId, AgentAuthSummary> {
        val probed = HashMap<AgentId, AgentAuthSummary>()
        rows.filter { it.id in AgentAuthAdapters.knownAgentIds && !it.dismissed }.forEach { row ->
            val cached = authCache.get(connectionId, row.id)
            probed[row.id] = cached ?: probeAgentAuth(connection, connectionId, row.id).summary()
        }
        return probed
    }

    private suspend fun probeAgentAuth(
        connection: SshConnection,
        connectionId: String,
        agentId: AgentId,
    ): AgentAuthProbe {
        val adapter = AgentAuthAdapters.resolve(agentId)
            ?: return AgentAuthProbe(AgentAuthStatus.Unknown, null, canLogout = false)
        val result = connection.runCommand(
            "exec bash -lc ${SshSessionStore.shellQuote(adapter.probeCommand)}",
        )
        val probe = adapter.probeResult(result)
        authCache.put(connectionId, agentId, probe.summary())
        return probe
    }

    private suspend fun <T> hostCall(block: suspend () -> T): Result<T> =
        try {
            Result.success(block())
        } catch (error: AgentAuthRequiredException) {
            Result.failure(
                AgentApiException(
                    AgentApiError.Problem(
                        status = 401,
                        title = "Sign in on the host",
                        detail = hostLoginInstructions(error.agentId),
                    ),
                ),
            )
        } catch (error: AgentLaunchException) {
            Result.failure(
                AgentApiException(
                    AgentApiError.Problem(
                        status = 503,
                        title = "Agent failed to start",
                        detail = error.message,
                    ),
                ),
            )
        } catch (error: Throwable) {
            Result.failure(
                AgentApiException(
                    AgentApiError.Transport(error),
                ),
            )
        }
}
