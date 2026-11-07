package harold.android.transport.ssh

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AgentRuntimeState
import harold.android.contracts.AgentRuntimeStatus
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
        factory.useConnection(connectionId) { connection, _ -> detectAgents(connection) }.getOrThrow()
    }

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
    ): Result<AgentAuth> = Result.success(
        AgentAuth(
            agentId = agentId,
            status = AgentAuthStatus.Unknown,
            error = null,
            session = null,
        ),
    )

    override suspend fun logoutAgentAuth(
        connectionId: String,
        agentId: AgentId,
    ): Result<AgentAuthSummary> = unsupported("Agent sign-in is managed by the agent CLI on the host.")

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
        return Workspace(
            id = workspace.id,
            name = workspace.name,
            path = workspace.path,
            state = if (entry?.directory == true) WorkspaceState.Available else WorkspaceState.Missing,
            createdAt = workspace.createdAt,
            lastUsedAt = workspace.lastUsedAt,
        )
    }

    private suspend fun detectAgents(connection: SshConnection): AgentSettingsCollection {
        val script = """
            for c in cursor-agent opencode; do
              p=${'$'}(command -v "${'$'}c" 2>/dev/null || true)
              if [ -n "${'$'}p" ]; then printf '%s\t%s\n' "${'$'}c" "${'$'}p"; fi
            done
        """.trimIndent()
        val result = connection.runCommand(
            "exec bash -lc ${SshSessionStore.shellQuote(script)}",
        )
        if (!result.succeeded) {
            throw SshException(result.stderr.trim().ifBlank { "Could not detect agents." })
        }
        val items = result.stdout.lineSequence()
            .filter { line -> line.contains('\t') }
            .mapNotNull { line ->
                val (command, path) = line.split('\t', limit = 2)
                val id = when (command) {
                    "cursor-agent" -> "cursor"
                    else -> command
                }
                val display = when (id) {
                    "cursor" -> "Cursor"
                    "opencode" -> "OpenCode"
                    else -> command
                }
                AgentSettings(
                    id = id,
                    displayName = display,
                    available = true,
                    enabled = true,
                    path = path,
                    args = listOf("acp"),
                    present = true,
                    popular = id == "cursor" || id == "opencode",
                    deletable = false,
                    state = AgentRuntimeState(AgentRuntimeStatus.Ready),
                    capabilities = null,
                    authSummary = AgentAuthSummary(
                        status = AgentAuthStatus.Unknown,
                        error = null,
                        activeSessionId = null,
                        canLogout = false,
                    ),
                )
            }
            .toList()
        return AgentSettingsCollection(items = items)
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
