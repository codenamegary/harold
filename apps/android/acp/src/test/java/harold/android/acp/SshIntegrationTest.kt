package harold.android.acp

import harold.android.contracts.CreateCustomAgentBody
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.PromptRequestBody
import harold.android.contracts.SessionStreamServerMessage
import harold.android.contracts.UpdateAgentBody
import harold.android.contracts.WorkspaceSource
import harold.android.contracts.WorkspaceState
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SshAuth
import harold.android.credentials.SshConfig
import harold.android.credentials.SavedConnection
import harold.android.host.HostAgentApi
import harold.android.host.HostAgentConfigRow
import harold.android.host.HostConnections
import harold.android.host.HostWorkspaceApi
import harold.android.host.SshAgentProcessLauncher
import harold.android.host.SshSessionFileService
import harold.android.host.SshSessionStore
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.network.AgentAuthCache
import harold.android.testing.FakeConnectionStore
import harold.android.transport.ssh.JschSshConnectionFactory
import harold.android.transport.ssh.JschSshConnectionPool
import harold.android.transport.ssh.SshConnection
import harold.android.transport.ssh.SshConnectionPool
import harold.android.transport.ssh.SshKeyGenerator
import harold.android.transport.ssh.captureHostKeyFingerprint
import harold.android.transport.ssh.runCommand
import java.io.File
import java.lang.Process
import java.net.ServerSocket
import java.net.Socket
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test

/**
 * End-to-end SSH transport test against scripts/ssh-test-server.py and
 * scripts/fake-acp-agent.py. Skipped unless HAROLD_RUN_SSH_TESTS=1.
 */
class SshIntegrationTest {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var server: Process? = null
    private lateinit var tempDir: Path
    private lateinit var binDir: Path
    private lateinit var connectionId: String
    private lateinit var sshConfig: SshConfig
    private lateinit var repository: ConnectionRepository
    private lateinit var connectionPool: SshConnectionPool
    private lateinit var sessionFactory: AcpSessionFactory
    private lateinit var acpApi: DefaultAcpAgentApi
    private lateinit var hostAgents: HostAgentApi
    private lateinit var hostWorkspaces: HostWorkspaceApi

    @Before
    fun setUp() = runBlocking {
        assumeTrue(System.getenv("HAROLD_RUN_SSH_TESTS") == "1")
        val repoRoot = findRepoRoot()
        val python = System.getenv("HAROLD_SSH_TEST_PYTHON")
            ?: "/tmp/harold-ssh-venv/bin/python"
        assumeTrue(File(python).exists())

        tempDir = Files.createTempDirectory(Path.of("/tmp/opencode"), "harold-ssh-test")
        val hostKey = tempDir.resolve("hostkey")
        binDir = tempDir.resolve("bin")
        Files.createDirectories(binDir)
        val fakeAgent = tempDir.resolve("fake-acp-agent.py")
        Files.copy(
            File(repoRoot, "scripts/fake-acp-agent.py").toPath(),
            fakeAgent,
        )
        val stateDir = tempDir.resolve("fake-state")
        fun writeAgent(binaryName: String, agentId: String, sessionId: String) {
            val wrapper = binDir.resolve(binaryName)
            Files.writeString(
                wrapper,
                """
                #!/bin/sh
                HAROLD_FAKE_ACP_AGENT_ID=$agentId \
                HAROLD_FAKE_ACP_SESSION_ID=$sessionId \
                HAROLD_FAKE_ACP_STATE_DIR=$stateDir \
                HAROLD_FAKE_ACP_LOG=${tempDir.resolve("fake-acp.log")} \
                  exec ${python} ${fakeAgent.toAbsolutePath()}
                """.trimIndent() + "\n",
            )
            wrapper.toFile().setExecutable(true)
        }
        writeAgent("opencode", "opencode", "ses_test_opencode")
        writeAgent("amp-acp", "amp-acp", "ses_test_amp")

        val port = ServerSocket(0).use { socket -> socket.localPort }
        val homeDir = tempDir.resolve("home")
        Files.createDirectories(homeDir)
        server = ProcessBuilder(
            python,
            File(repoRoot, "scripts/ssh-test-server.py").absolutePath,
            "--host",
            "127.0.0.1",
            "--port",
            port.toString(),
            "--host-key",
            hostKey.toAbsolutePath().toString(),
            "--path-prefix",
            binDir.toAbsolutePath().toString(),
            "--home",
            homeDir.toAbsolutePath().toString(),
        )
            .directory(homeDir.toFile())
            .redirectErrorStream(true)
            .redirectOutput(tempDir.resolve("ssh-server.log").toFile())
            .start()
        awaitPort(port)

        val key = SshKeyGenerator.generate()
        val base = SshConfig(
            host = "127.0.0.1",
            port = port,
            user = System.getProperty("user.name") ?: "codenamegary",
            auth = SshAuth.PrivateKey(key.privateKeyPem, key.publicKey),
            hostKeyFingerprint = "",
        )
        val fingerprint = captureHostKeyFingerprint(base)
        val config = base.copy(hostKeyFingerprint = fingerprint)
        sshConfig = config
        connectionId = config.connectionId
        val saved = SavedConnection(
            formatVersion = 3,
            connectionId = connectionId,
            deviceName = "integration",
            name = "integration",
            colorId = "tide",
            iconId = "terminal",
            ssh = config,
        )
        repository = ConnectionRepository(FakeConnectionStore(saved))
        val registry = AcpSessionRegistry()
        val catalog = AcpSessionCatalog()
        val transport = JschSshConnectionFactory()
        connectionPool = JschSshConnectionPool(repository, transport)
        val connections = HostConnections(repository, connectionPool)
        val launcher = SshAgentProcessLauncher(connections)
        sessionFactory = AcpSessionFactory(
            launcher = launcher,
            registry = registry,
            catalog = catalog,
            files = SshSessionFileService(connections),
        )
        acpApi = DefaultAcpAgentApi(
            factory = sessionFactory,
            registry = registry,
            authCache = AgentAuthCache(),
            launcher = launcher,
        )
        hostAgents = HostAgentApi(connections, AgentAuthCache(), acpApi)
        hostWorkspaces = HostWorkspaceApi(connections, catalog)

        // Start host state fresh: a previous run's agents.json would carry a
        // path into its deleted temp directory.
        useConnection { connection, _ ->
            connection.runCommand("rm -f ~/.harold/agents.json")
        }
        Unit
    }

    @After
    fun tearDown() {
        // Runs even when a test body fails: a leftover agents.json would
        // carry this run's temp paths into the host's real agent config.
        if (::repository.isInitialized) {
            runBlocking {
                useConnection { connection, _ ->
                    connection.runCommand("rm -f ~/.harold/agents.json")
                }
            }
        }
        if (::connectionPool.isInitialized) {
            connectionPool.closeAll()
        }
        server?.destroy()
        server?.waitFor(5, TimeUnit.SECONDS)
        scope.cancel()
        if (::tempDir.isInitialized && System.getenv("HAROLD_KEEP_SSH_TEST") != "1") {
            tempDir.toFile().deleteRecursively()
        }
    }

    @Test
    fun createPromptPermissionTerminalAndResume() = runBlocking {
        fun step(message: String) {
            tempDir.resolve("test.log").toFile().appendText(message + "\n")
        }
        step("listAgents")
        val agents = hostAgents.listAgents(connectionId).getOrThrow()
        assertTrue(agents.items.any { agent -> agent.id == "opencode" })
        assertTrue(agents.items.any { agent -> agent.id == "amp-acp" })

        step("createSession")
        val cwd = Files.createTempDirectory(Path.of("/tmp/opencode"), "harold-work")
        val created = acpApi.createSession(
            connectionId,
            harold.android.contracts.CreateSessionBody(agentId = "opencode", cwd = cwd.toString()),
        ).getOrThrow()
        assertEquals("ses_test_opencode", created.sessionId)
        assertTrue(created.configOptions.isNotEmpty())

        val ampCwd = Files.createTempDirectory(Path.of("/tmp/opencode"), "harold-amp")
        val ampCreated = acpApi.createSession(
            connectionId,
            harold.android.contracts.CreateSessionBody(agentId = "amp-acp", cwd = ampCwd.toString()),
        ).getOrThrow()
        assertEquals("ses_test_amp", ampCreated.sessionId)

        // The list is compiled from ACP session/list across both agents. The
        // app writes no per-session file on the host.
        val sessions = acpApi.listSessions(connectionId).getOrThrow()
        assertTrue(
            sessions.items.any { session ->
                session.agentId == "opencode" && session.sessionId == created.sessionId
            },
        )
        assertTrue(
            sessions.items.any { session ->
                session.agentId == "amp-acp" && session.sessionId == ampCreated.sessionId
            },
        )
        val filtered = acpApi.listSessions(connectionId, cwd.toString()).getOrThrow()
        assertTrue(filtered.items.all { session -> session.cwd == cwd.toString() })
        assertFalse(Files.exists(sessionMetadataPath(created.sessionId)))
        assertFalse(Files.exists(tempDir.resolve("home/.harold/sessions")))
        assertFalse(Files.exists(tempDir.resolve("home/.harold/workspaces.json")))

        val frames = mutableListOf<SessionStreamServerMessage>()
        val permission = CompletableDeferred<SessionStreamServerMessage.PermissionRequest>()
        val complete = CompletableDeferred<Unit>()
        val subscribed = CompletableDeferred<Unit>()
        val titled = CompletableDeferred<String>()
        step("open first")
        val session = sessionFactory.open(connectionId, "opencode", created.sessionId, scope).getOrThrow()
        step("opened first")
        val collector = scope.launch {
            session.events.collect { message ->
                frames += message
                when (message) {
                    is SessionStreamServerMessage.Subscribed -> subscribed.complete(Unit)
                    is SessionStreamServerMessage.PermissionRequest -> permission.complete(message)
                    is SessionStreamServerMessage.PromptComplete -> complete.complete(Unit)
                    is SessionStreamServerMessage.SessionInfo ->
                        message.title?.let { title ->
                            if (title == "Fake titled session") {
                                titled.complete(title)
                            }
                        }
                    else -> Unit
                }
            }
        }
        withTimeout(30_000) { subscribed.await() }

        // Every stream open is a full replay and must start with a reset, so
        // the stream owner clears what it holds before the replay lands.
        assertTrue(frames.first() is SessionStreamServerMessage.StreamReset)

        acpApi.prompt(
            connectionId,
            "opencode",
            created.sessionId,
            PromptRequestBody(text = "hello"),
        ).getOrThrow()

        val request = withTimeout(30_000) { permission.await() }
        acpApi.replyPermission(connectionId, request.requestId, "allow").getOrThrow()
        withTimeout(30_000) { complete.await() }

        val text = frames.filterIsInstance<SessionStreamServerMessage.SessionUpdate>()
            .joinToString(" ") { update -> update.update.toString() }
        assertTrue(text.contains("permission answered"))
        assertTrue(text.contains("terminal result received"))
        assertTrue(text.contains("hello from fake acp"))
        // session_info_update is translated to the stream's session_info
        // frame, so the live title map follows the agent without a file.
        assertEquals("Fake titled session", withTimeout(30_000) { titled.await() })

        step("close first")
        session.close()
        collector.cancel()
        // Give the test server a moment to reap the old exec child before
        // reopening the same session.
        kotlinx.coroutines.delay(300)
        step("reopen")
        val resumed = sessionFactory.open(connectionId, "opencode", created.sessionId, scope).getOrThrow()
        step("reopened")
        val replayed = CompletableDeferred<Unit>()
        val resumedFrames = mutableListOf<SessionStreamServerMessage>()
        val resumeCollector = scope.launch {
            resumed.events.collect { message ->
                resumedFrames += message
                if (message is SessionStreamServerMessage.SessionUpdate) {
                    if (message.update.toString().contains("replayed history")) {
                        replayed.complete(Unit)
                    }
                }
            }
        }
        withTimeout(30_000) { replayed.await() }
        resumeCollector.cancel()
        resumed.close()

        // The reopened stream replays the conversation again and must also
        // start with a reset, or the resumed transcript would duplicate.
        assertTrue(resumedFrames.first() is SessionStreamServerMessage.StreamReset)
        assertTrue(frames.count { it is SessionStreamServerMessage.StreamReset } >= 1)

        acpApi.deleteSession(connectionId, "opencode", created.sessionId).getOrThrow()
        assertFalse(Files.exists(sessionMetadataPath(created.sessionId)))
        val afterDelete = acpApi.listSessions(connectionId).getOrThrow()
        assertFalse(
            afterDelete.items.any { session ->
                session.agentId == "opencode" && session.sessionId == created.sessionId
            },
        )
        assertTrue(
            afterDelete.items.any { session ->
                session.agentId == "amp-acp" && session.sessionId == ampCreated.sessionId
            },
        )
        val log = tempDir.resolve("fake-acp.log").toFile().readText()
        assertTrue(log.contains("method=session/list"))
        assertTrue(log.contains("method=session/delete"))
    }

    @Test
    fun createSessionReportsAStaleAgentPath() = runBlocking {
        writeAgentConfig(
            listOf(
                HostAgentConfigRow(
                    id = "opencode",
                    path = "/missing/bin/opencode",
                    args = listOf("acp"),
                    updatedAt = "now",
                ),
            ),
        )
        val cwd = Files.createTempDirectory(Path.of("/tmp/opencode"), "harold-stale-path")

        val result = acpApi.createSession(
            connectionId,
            harold.android.contracts.CreateSessionBody(agentId = "opencode", cwd = cwd.toString()),
        )

        val problem = launchProblem(result.exceptionOrNull())
        assertEquals(503, problem.status)
        assertEquals("Agent failed to start", problem.title)
        assertTrue(problem.detail.orEmpty().contains("/missing/bin/opencode"))
        assertTrue(problem.detail.orEmpty().contains("not executable"))
    }

    @Test
    fun createSessionReportsAgentStderrWhenTheProcessExits() = runBlocking {
        val broken = tempDir.resolve("broken-opencode")
        Files.writeString(
            broken,
            "#!/bin/sh\necho 'opencode crashed during startup' >&2\nexit 2\n",
        )
        broken.toFile().setExecutable(true)
        writeAgentConfig(
            listOf(
                HostAgentConfigRow(
                    id = "opencode",
                    path = broken.toAbsolutePath().toString(),
                    args = listOf("acp"),
                    updatedAt = "now",
                ),
            ),
        )
        val cwd = Files.createTempDirectory(Path.of("/tmp/opencode"), "harold-broken-agent")

        val result = acpApi.createSession(
            connectionId,
            harold.android.contracts.CreateSessionBody(agentId = "opencode", cwd = cwd.toString()),
        )

        val problem = launchProblem(result.exceptionOrNull())
        assertEquals(503, problem.status)
        assertTrue(problem.detail.orEmpty().contains("opencode crashed during startup"))
    }

    @Test
    fun scanRepairsAnAgentWhoseSavedPathDisappeared() = runBlocking {
        writeAgentConfig(
            listOf(
                HostAgentConfigRow(
                    id = "opencode",
                    path = "/missing/bin/opencode",
                    args = listOf("acp"),
                    updatedAt = "now",
                ),
            ),
        )

        val scanned = hostAgents.scanAgents(connectionId).getOrThrow()
        val opencode = scanned.items.first { agent -> agent.id == "opencode" }
        assertEquals(binDir.resolve("opencode").toAbsolutePath().toString(), opencode.path)
        assertTrue(opencode.present)
    }

    @Test
    fun agentConfigRoundTripMergeAndCustomAgents() = runBlocking {
        // First scan discovers the fake agent and writes agents.json.
        val scanned = hostAgents.scanAgents(connectionId).getOrThrow()
        val opencode = scanned.items.find { agent -> agent.id == "opencode" }
        assertTrue(opencode != null && opencode.present)
        useConnection() { _, store ->
            assertTrue(store.readAgentsConfig() != null)
        }

        // A rescan preserves the user-owned fields.
        hostAgents.updateAgent(
            connectionId,
            "opencode",
            UpdateAgentBody(
                displayName = "My OpenCode",
                path = opencode!!.path,
                args = listOf("acp", "--extra"),
                enabled = false,
            ),
        ).getOrThrow()
        val rescan = hostAgents.scanAgents(connectionId).getOrThrow()
        val preserved = rescan.items.find { agent -> agent.id == "opencode" }!!
        assertEquals("My OpenCode", preserved.displayName)
        assertEquals(listOf("acp", "--extra"), preserved.args)
        assertFalse(preserved.enabled)

        // A dismissed known agent stays dismissed across rescans, whether or
        // not the binary is on the host.
        hostAgents.deleteAgent(connectionId, "cursor").getOrThrow()
        val afterDismiss = hostAgents.scanAgents(connectionId).getOrThrow()
        assertTrue(afterDismiss.items.find { agent -> agent.id == "cursor" }!!.dismissed)

        // Custom agents: created with a verified path, deleted outright.
        val helper = tempDir.resolve("helper-agent.sh")
        Files.writeString(helper, "#!/bin/sh\necho hi\n")
        helper.toFile().setExecutable(true)
        val custom = hostAgents.createCustomAgent(
            connectionId,
            CreateCustomAgentBody(
                displayName = "My Helper",
                path = helper.toAbsolutePath().toString(),
                args = listOf("--x"),
            ),
        ).getOrThrow()
        assertTrue(custom.id.startsWith("custom-"))
        assertTrue(custom.present)
        assertTrue(custom.deletable)

        val duplicate = hostAgents.createCustomAgent(
            connectionId,
            CreateCustomAgentBody(
                displayName = "My Helper",
                path = helper.toAbsolutePath().toString(),
            ),
        ).getOrThrow()
        assertTrue(duplicate.id != custom.id)

        assertTrue(
            hostAgents.createCustomAgent(
                connectionId,
                CreateCustomAgentBody(
                    displayName = "Broken",
                    path = tempDir.resolve("missing-binary").toString(),
                ),
            ).isFailure,
        )

        hostAgents.deleteAgent(connectionId, custom.id).getOrThrow()
        assertTrue(
            hostAgents.updateAgent(connectionId, custom.id, UpdateAgentBody(enabled = true)).isFailure,
        )

        // An unknown agent id cannot be edited.
        assertTrue(
            hostAgents.updateAgent(connectionId, "not-a-known-agent", UpdateAgentBody(enabled = true))
                .isFailure,
        )

        Unit
    }

    @Test
    fun workspaceValidationAndGitBadge() = runBlocking {
        // A path that does not exist is rejected.
        assertTrue(
            hostWorkspaces.createWorkspace(
                connectionId,
                CreateWorkspaceBody(
                    source = WorkspaceSource.Folder,
                    path = tempDir.resolve("does-not-exist").toString(),
                ),
            ).isFailure,
        )

        // A plain file is rejected as not a folder.
        val file = tempDir.resolve("plain-file.txt")
        Files.writeString(file, "just a file")
        assertTrue(
            hostWorkspaces.createWorkspace(
                connectionId,
                CreateWorkspaceBody(source = WorkspaceSource.Folder, path = file.toString()),
            ).isFailure,
        )

        // A real folder works, auto-names from the basename, and is not git yet.
        val folder = Files.createTempDirectory(Path.of("/tmp/opencode"), "harold-ws")
        val workspace = hostWorkspaces.createWorkspace(
            connectionId,
            CreateWorkspaceBody(source = WorkspaceSource.Folder, path = folder.toString()),
        ).getOrThrow()
        assertEquals(WorkspaceState.Available, workspace.state)
        assertEquals(folder.fileName.toString(), workspace.name)
        assertFalse(workspace.git)

        useConnection() { connection, _ ->
            connection.runCommand(
                "cd ${SshSessionStore.shellQuote(folder.toString())} && git init -q",
            )
        }
        val listed = hostWorkspaces.listWorkspaces(connectionId, limit = 100).getOrThrow()
        assertEquals(true, listed.items.find { it.path == folder.toString() }?.git)

        useConnection() { connection, store ->
            connection.runCommand("rm -rf ${SshSessionStore.shellQuote(folder.toString())}")
            store.forgetWorkspace(folder.toString())
        }
        Unit
    }

    private suspend fun <T> useConnection(
        block: suspend (SshConnection, SshSessionStore) -> T,
    ): T {
        val connection = JschSshConnectionFactory().connect(sshConfig)
        return try {
            val home = connection.realPath(".")
            block(connection, SshSessionStore(connection, home))
        } finally {
            connection.close()
        }
    }

    private suspend fun writeAgentConfig(rows: List<HostAgentConfigRow>) {
        useConnection() { _, store ->
            store.writeAgentsConfig(rows)
        }
    }

    private fun launchProblem(error: Throwable?): AgentApiError.Problem {
        val problem = ((error as? AgentApiException)?.error as? AgentApiError.Problem)
            ?: error("expected an AgentApiError.Problem, got $error")
        return problem
    }

    private fun sessionMetadataPath(sessionId: String): Path = tempDir.resolve(
        "home/.harold/sessions/opencode/$sessionId.json",
    )

    private fun awaitPort(port: Int) {
        val deadline = System.currentTimeMillis() + 15_000
        while (System.currentTimeMillis() < deadline) {
            runCatching {
                Socket().use { socket -> socket.connect(java.net.InetSocketAddress("127.0.0.1", port), 500) }
                return
            }
            Thread.sleep(100)
        }
        error("SSH test server did not start on port $port")
    }

    private fun findRepoRoot(): File {
        var dir = File("").absoluteFile
        while (true) {
            if (File(dir, "scripts/ssh-test-server.py").isFile) {
                return dir
            }
            dir = dir.parentFile ?: error("repository root not found")
        }
    }
}
