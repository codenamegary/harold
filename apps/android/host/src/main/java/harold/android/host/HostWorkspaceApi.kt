package harold.android.host

import harold.android.contracts.AttachmentDescriptor
import harold.android.contracts.AttachmentKind
import harold.android.contracts.AttachmentUploadRequest
import harold.android.contracts.AgentId
import harold.android.contracts.CreateFilesystemDirectoryBody
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
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceCollection
import harold.android.contracts.WorkspaceSource
import harold.android.contracts.WorkspaceState
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.network.AttachmentApi
import harold.android.network.GitApi
import harold.android.network.SessionDirectoryProvider
import harold.android.network.WorkspaceApi
import harold.android.network.hostLoginInstructions
import harold.android.process.AgentAuthRequiredException
import harold.android.process.AgentLaunchException
import harold.android.transport.ssh.SshConnection
import harold.android.transport.ssh.SshException
import harold.android.transport.ssh.runCommand
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/** Workspaces, attachments, filesystem, and read-only git over one SSH connection. */
@Singleton
class HostWorkspaceApi @Inject constructor(
    private val connections: HostConnections,
    private val sessionDirectories: SessionDirectoryProvider,
) : WorkspaceApi, AttachmentApi, GitApi {
    override suspend fun listWorkspaces(
        connectionId: String,
        limit: Int,
    ): Result<WorkspaceCollection> = hostCall {
        connections.useConnection(connectionId) { connection, store ->
            val now = Instant.now().toString()
            val workspaces = linkedMapOf<String, Workspace>()
            store.workspaces().forEach { workspace ->
                workspaces[workspace.path] = workspaceOf(connection, workspace)
            }
            // Session folders are hints from the last ACP session/list. They
            // are memory-only; a cold app simply shows the saved workspaces
            // until the next chat refresh. Hidden paths were deleted by the
            // user and stay out of the list.
            val hidden = store.hiddenWorkspaces()
            sessionDirectories.sessionDirectories(connectionId)
                .distinct()
                .filterNot { cwd -> cwd in hidden }
                .forEach { cwd ->
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
        }
    }

    override suspend fun listFilesystemDirectories(
        connectionId: String,
        root: String?,
    ): Result<FilesystemDirectoryCollection> = hostCall {
        connections.useConnection(connectionId) { connection, store ->
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
        }
    }

    override suspend fun createFilesystemDirectory(
        connectionId: String,
        body: CreateFilesystemDirectoryBody,
    ): Result<FilesystemDirectoryCreated> = hostCall {
        connections.useConnection(connectionId) { connection, _ ->
            val path = "${body.parent.trimEnd('/')}/${body.name}"
            connection.mkdir(path)
            FilesystemDirectoryCreated(name = body.name, path = path)
        }
    }

    override suspend fun createWorkspace(
        connectionId: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace> = hostCall {
        connections.useConnection(connectionId) { connection, store ->
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
        }
    }

    override suspend fun deleteWorkspace(connectionId: String, path: String): Result<Unit> = hostCall {
        connections.useConnection(connectionId) { _, store ->
            store.forgetWorkspace(path)
        }
    }

    override suspend fun uploadAttachment(
        connectionId: String,
        request: AttachmentUploadRequest,
    ): Result<AttachmentDescriptor> = hostCall {
        connections.useConnection(connectionId) { _, store ->
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
        }
    }

    override suspend fun deleteAttachment(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        attachmentId: String,
    ): Result<Unit> = hostCall {
        connections.useConnection(connectionId) { connection, store ->
            val path = if (attachmentId.startsWith("/")) {
                attachmentId
            } else {
                store.uploadPath(sessionId, attachmentId)
            }
            connection.remove(path)
        }
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

    private suspend fun <T> git(
        connectionId: String,
        block: suspend (SshGit) -> Result<T>,
    ): Result<T> = hostCall {
        connections.useConnection(connectionId) { connection, _ ->
            block(SshGit(connection)).getOrThrow()
        }
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
