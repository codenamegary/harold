package harold.android.transport.ssh

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.contracts.AgentSettingsCollection
import harold.android.contracts.AttachmentDescriptor
import harold.android.contracts.AttachmentKind
import harold.android.contracts.AttachmentUploadRequest
import harold.android.contracts.ConfigValue
import harold.android.contracts.CreateFilesystemDirectoryBody
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.CreateCustomAgentBody
import harold.android.contracts.FilesystemDirectory
import harold.android.contracts.FilesystemDirectoryCollection
import harold.android.contracts.FilesystemDirectoryCreated
import harold.android.contracts.GitChanges
import harold.android.contracts.GitFileDiff
import harold.android.contracts.GitScope
import harold.android.contracts.GitSummary
import harold.android.contracts.GitWorktreeCollection
import harold.android.contracts.PageInfo
import harold.android.contracts.PromptRequestBody
import harold.android.contracts.Session
import harold.android.contracts.SessionCollection
import harold.android.contracts.SetSessionWorktreePathBody
import harold.android.contracts.UpdateAgentBody
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection
import harold.android.contracts.WorkspaceSource
import harold.android.contracts.WorkspaceState
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.network.AgentTransportApi
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.JsonElement

@Singleton
class SshAgentApi @Inject constructor(
    private val factory: SshAcpSessionFactory,
    private val registry: SshAcpRegistry,
) : AgentTransportApi {
    private val authCache = AgentAuthCache()

    private val unknownAuth = AgentAuthSummary(
        status = AgentAuthStatus.Unknown,
        error = null,
        activeSessionId = null,
        canLogout = false,
    )

    override suspend fun listWorkspaces(
        connectionId: String,
        limit: Int,
    ): Result<WorkspaceCollection> = sshCall {
        factory.useConnection(connectionId) { connection, store ->
            val now = Instant.now().toString()
            val workspaces = linkedMapOf<String, Workspace>()
            store.workspaces().forEach { workspace ->
                workspaces[workspace.path] = workspaceOf(connection, workspace)
            }
            store.listSessions().map { session -> session.cwd }.distinct().forEach { cwd ->
                if (cwd !in workspaces) {
                    workspaces[cwd] = workspaceOf(
                        connection = connection,
                        workspace = HostWorkspace(
                            id = SshSessionStore.stableId(cwd),
                            name = cwd.substringAfterLast('/').ifBlank { cwd },
                            path = cwd,
                            createdAt = now,
                            lastUsedAt = now,
                        ),
                    )
                }
            }
            val items = if (limit > 0) workspaces.values.take(limit) else workspaces.values.toList()
            WorkspaceCollection(
                items = items,
                page = PageInfo(limit = limit, count = items.size),
            )
        }.getOrThrow()
    }

    override suspend fun listFilesystemDirectories(
        connectionId: String,
        root: String?,
    ): Result<FilesystemDirectoryCollection> = sshCall {
        factory.useConnection(connectionId) { connection, store ->
            val path = root?.takeIf { it.isNotBlank() } ?: store.home
            val items = connection.list(path)
                .filter { entry -> entry.directory }
                .map { entry ->
                    FilesystemDirectory(name = entry.name, path = entry.path)
                }
                .sortedBy { entry -> entry.name.lowercase() }
            FilesystemDirectoryCollection(
                path = path,
                parent = if (path.trimEnd('/') == store.home.trimEnd('/')) {
                    null
                } else {
                    path.substringBeforeLast('/', "").ifBlank { "/" }
                },
                items = items,
            )
        }.getOrThrow()
    }

    override suspend fun createFilesystemDirectory(
        connectionId: String,
        body: CreateFilesystemDirectoryBody,
    ): Result<FilesystemDirectoryCreated> = sshCall {
        factory.useConnection(connectionId) { connection, _ ->
            val path = "${body.parent.trimEnd('/')}/${body.name}"
            connection.mkdir(path)
            FilesystemDirectoryCreated(name = body.name, path = path)
        }.getOrThrow()
    }

    override suspend fun createWorkspace(
        connectionId: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace> = sshCall {
        factory.useConnection(connectionId) { connection, store ->
            when (body.source) {
                WorkspaceSource.Folder -> {
                    val entry = connection.stat(body.path)
                        ?: throw SshException("Folder does not exist: ${body.path}")
                    if (!entry.directory) {
                        throw SshException("Not a folder: ${body.path}")
                    }
                }
                WorkspaceSource.Git -> {
                    val url = body.url ?: throw SshException("Clone URL is required.")
                    val result = connection.runCommand(
                        "git clone ${SshSessionStore.shellQuote(url)} " +
                            SshSessionStore.shellQuote(body.path),
                    )
                    if (!result.succeeded) {
                        throw SshException(result.stderr.trim().ifBlank { "git clone failed" })
                    }
                }
            }
            val name = body.name?.takeIf { it.isNotBlank() }
                ?: body.path.substringAfterLast('/').ifBlank { body.path }
            val workspace = store.rememberWorkspace(body.path, name)
            workspaceOf(connection, workspace)
        }.getOrThrow()
    }

    override suspend fun listSessions(
        connectionId: String,
        cwd: String?,
    ): Result<SessionCollection> = sshCall {
        factory.useConnection(connectionId) { _, store ->
            SessionCollection(
                items = store.listSessions()
                    .filter { metadata -> cwd == null || metadata.cwd == cwd }
                    .map { metadata ->
                        Session(
                            agentId = metadata.agent,
                            sessionId = metadata.sessionId,
                            cwd = metadata.cwd,
                            title = metadata.title,
                            updatedAt = metadata.lastUsedAt,
                            worktreePath = metadata.worktreePath,
                        )
                    },
            )
        }.getOrThrow()
    }

    override suspend fun listAgents(connectionId: String): Result<AgentSettingsCollection> = sshCall {
        factory.useConnection(connectionId) { connection, store ->
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
        }.getOrThrow()
    }

    override suspend fun scanAgents(connectionId: String): Result<AgentSettingsCollection> = sshCall {
        factory.useConnection(connectionId) { connection, store ->
            val rows = scanPresence(connection, store.agentsConfig())
            store.writeAgentsConfig(rows)
            agentCollection(connection, connectionId, rows)
        }.getOrThrow()
    }

    override suspend fun updateAgent(
        connectionId: String,
        agentId: AgentId,
        body: UpdateAgentBody,
    ): Result<AgentSettings> = sshCall {
        factory.useConnection(connectionId) { connection, store ->
            val row = store.agentsConfig().find { it.id == agentId }
                ?: throw SshException("Unknown agent: $agentId. Scan the host first.")
            val newPath = body.path
            newPath?.takeIf { it.isNotBlank() }?.let { path ->
                if (!isExecutable(connection, path)) {
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
                rows.map { if (it.id == agentId) updated else it }
            }
            agentCollection(connection, connectionId, store.agentsConfig())
                .items.find { it.id == agentId }
                ?: throw SshException("Agent row vanished while saving.")
        }.getOrThrow()
    }

    override suspend fun createCustomAgent(
        connectionId: String,
        body: CreateCustomAgentBody,
    ): Result<AgentSettings> = sshCall {
        factory.useConnection(connectionId) { connection, store ->
            val path = body.path.trim()
            if (path.isEmpty()) {
                throw SshException("A custom agent needs a path to its executable.")
            }
            if (!isExecutable(connection, path)) {
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
        }.getOrThrow()
    }

    override suspend fun deleteAgent(connectionId: String, agentId: AgentId): Result<Unit> = sshCall {
        factory.useConnection(connectionId) { _, store ->
            val known = knownAgent(agentId) != null
            store.updateAgentsConfig { rows ->
                if (known) {
                    // Known agents keep a tombstone so rescans do not
                    // resurrect them. User-owned fields stay untouched.
                    rows.map { current ->
                        if (current.id == agentId) {
                            current.copy(dismissed = true, updatedAt = Instant.now().toString())
                        } else {
                            current
                        }
                    }
                } else {
                    // Custom agents delete outright.
                    rows.filterNot { it.id == agentId }
                }
            }
            restartAgent(connectionId, agentId).getOrThrow()
        }.getOrThrow()
    }

    override suspend fun reloadConfig(connectionId: String): Result<AgentSettingsCollection> = sshCall {
        factory.useConnection(connectionId) { connection, store ->
            authCache.clear()
            agentCollection(connection, connectionId, store.agentsConfig())
        }.getOrThrow()
    }

    override suspend fun restartAgent(connectionId: String, agentId: AgentId): Result<Unit> = sshCall {
        registry.all()
            .filter { it.connectionId == connectionId && it.agentId == agentId }
            .forEach { session ->
                runCatching { session.close() }
            }
        authCache.invalidate(connectionId, agentId)
    }

    override suspend fun getAgentCapabilities(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<AgentCapabilityInventory?> = Result.success(
        registry.find(connectionId, agentId, sessionId)?.capabilities,
    )

    override suspend fun createSession(
        connectionId: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> = sshCall {
        factory.createSession(
            connectionId = connectionId,
            agentId = body.agentId,
            cwd = body.cwd,
            deviceName = deviceName(),
        ).getOrThrow()
    }

    override suspend fun deleteSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = sshCall {
        factory.deleteSession(connectionId, agentId, sessionId).getOrThrow()
    }

    override suspend fun getAgentAuth(
        connectionId: String,
        agentId: AgentId,
    ): Result<AgentAuth> = sshCall {
        factory.useConnection(connectionId) { connection, _ ->
            val probe = authCache.get(connectionId, agentId)
                ?: probeAgentAuth(connection, connectionId, agentId)
            AgentAuth(
                agentId = agentId,
                status = probe.status,
                error = probe.error,
                session = null,
            )
        }.getOrThrow()
    }

    override suspend fun logoutAgentAuth(
        connectionId: String,
        agentId: AgentId,
    ): Result<AgentAuthSummary> = sshCall {
        factory.useConnection(connectionId) { connection, _ ->
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
        }.getOrThrow()
    }

    override suspend fun prompt(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        body: PromptRequestBody,
    ): Result<Unit> = active(connectionId, agentId, sessionId) { session ->
        session.prompt(body)
    }

    override suspend fun cancel(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = active(connectionId, agentId, sessionId) { session ->
        session.cancel()
    }

    override suspend fun replyPermission(
        connectionId: String,
        requestId: String,
        optionId: String,
    ): Result<Unit> {
        val session = registry.all().firstOrNull { it.hasPermission(requestId) }
            ?: return Result.failure(
                AgentApiException(
                    AgentApiError.Problem(409, "Permission resolved", "This request is no longer active."),
                ),
            )
        return session.replyPermission(requestId, optionId)
    }

    override suspend fun replyExtension(
        connectionId: String,
        requestId: String,
        result: JsonElement,
    ): Result<Unit> = unsupported("ACP extensions are not available over SSH.")

    override suspend fun replyElicitation(
        connectionId: String,
        requestId: String,
        result: JsonElement,
    ): Result<Unit> {
        val session = registry.all().firstOrNull { it.hasElicitation(requestId) }
            ?: return Result.failure(
                AgentApiException(
                    AgentApiError.Problem(409, "Elicitation resolved", "This request is no longer active."),
                ),
            )
        return session.replyElicitation(requestId, result)
    }

    override suspend fun setConfigOption(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        configId: String,
        value: ConfigValue,
    ): Result<Unit> = active(connectionId, agentId, sessionId) { session ->
        session.setConfigOption(configId, value)
    }

    override suspend fun uploadAttachment(
        connectionId: String,
        request: AttachmentUploadRequest,
    ): Result<AttachmentDescriptor> = sshCall {
        factory.useConnection(connectionId) { _, store ->
            val path = store.writeUpload(
                sessionId = request.sessionId,
                fileName = request.fileName,
                bytes = request.bytes,
            )
            AttachmentDescriptor(
                id = path,
                name = request.fileName,
                mimeType = request.mimeType,
                kind = request.kind ?: AttachmentKind.File,
                size = request.bytes.size.toLong(),
                path = path,
            )
        }.getOrThrow()
    }

    override suspend fun deleteAttachment(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        attachmentId: String,
    ): Result<Unit> = sshCall {
        factory.useConnection(connectionId) { connection, store ->
            val path = if (attachmentId.startsWith("/")) {
                attachmentId
            } else {
                store.uploadPath(sessionId, attachmentId)
            }
            connection.remove(path)
        }.getOrThrow()
    }

    override suspend fun getSummary(
        connectionId: String,
        path: String,
    ): Result<GitSummary> = git(connectionId) { ssh -> ssh.summary(path) }

    override suspend fun listWorktrees(
        connectionId: String,
        path: String,
    ): Result<GitWorktreeCollection> = git(connectionId) { ssh -> ssh.worktrees(path) }

    override suspend fun getChanges(
        connectionId: String,
        path: String,
        scope: GitScope,
    ): Result<GitChanges> = git(connectionId) { ssh -> ssh.changes(path, scope) }

    override suspend fun getFileDiff(
        connectionId: String,
        worktreePath: String,
        scope: GitScope,
        filePath: String,
        oldPath: String?,
    ): Result<GitFileDiff> = git(connectionId) { ssh ->
        ssh.fileDiff(worktreePath, scope, filePath, oldPath)
    }

    override suspend fun updateSessionWorktreePath(
        connectionId: String,
        sessionId: String,
        body: SetSessionWorktreePathBody,
    ): Result<Unit> = sshCall {
        factory.updateWorktreePath(
            connectionId = connectionId,
            agentId = body.agentId,
            sessionId = sessionId,
            worktreePath = body.worktreePath,
        ).getOrThrow()
    }

    private suspend fun workspaceOf(
        connection: SshConnection,
        workspace: HostWorkspace,
    ): Workspace {
        val entry = connection.stat(workspace.path)
        val available = entry?.directory == true
        return Workspace(
            id = workspace.id,
            name = workspace.name,
            path = workspace.path,
            state = if (available) WorkspaceState.Available else WorkspaceState.Missing,
            createdAt = workspace.createdAt,
            lastUsedAt = workspace.lastUsedAt,
            git = available && SshGit(connection).isGit(workspace.path),
        )
    }

    private suspend fun scanPresence(
        connection: SshConnection,
        existing: List<HostAgentConfigRow>,
    ): List<HostAgentConfigRow> {
        val result = connection.runCommand(
            "exec bash -lc ${SshSessionStore.shellQuote(presenceProbeScript())}",
        )
        if (!result.succeeded) {
            throw SshException(result.stderr.trim().ifBlank { "Could not scan the host for agents." })
        }
        return mergeScanRows(existing, parsePresenceProbe(result.stdout))
    }

    private suspend fun isExecutable(connection: SshConnection, path: String): Boolean {
        val result = connection.runCommand(
            "test -x ${SshSessionStore.shellQuote(path)} && echo ok",
        )
        return result.succeeded && result.stdout.trim() == "ok"
    }

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
            probed[row.id] = (cached ?: probeAgentAuth(connection, connectionId, row.id)).summary()
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
        authCache.put(connectionId, agentId, probe)
        return probe
    }

    private suspend fun <T> active(
        connectionId: String,
        agentId: String,
        sessionId: String,
        block: suspend (SshAcpSession) -> Result<T>,
    ): Result<T> {
        val session = registry.find(connectionId, agentId, sessionId)
            ?: return Result.failure(
                AgentApiException(
                    AgentApiError.Problem(
                        status = 409,
                        title = "Session not connected",
                        detail = "Open this session again to start its agent process.",
                    ),
                ),
            )
        return block(session)
    }

    private suspend fun <T> git(
        connectionId: String,
        block: suspend (SshGit) -> Result<T>,
    ): Result<T> = sshCall {
        factory.useConnection(connectionId) { connection, _ ->
            block(SshGit(connection)).getOrThrow()
        }.getOrThrow()
    }

    private suspend fun <T> sshCall(block: suspend () -> T): Result<T> =
        try {
            Result.success(block())
        } catch (error: SshAuthRequiredException) {
            Result.failure(
                AgentApiException(
                    AgentApiError.Problem(
                        status = 401,
                        title = "Sign in on the host",
                        detail = hostLoginInstructions(error.agentId),
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

    private fun <T> unsupported(message: String): Result<T> =
        Result.failure(
            AgentApiException(
                AgentApiError.Problem(
                    status = 501,
                    title = "Not available",
                    detail = message,
                ),
            ),
        )
}

private fun deviceName(): String = runCatching {
    "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}".trim()
}.getOrDefault("Android")
