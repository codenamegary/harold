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
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
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
    private lateinit var runtime: AgentRuntime
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
        fun writeAgent(binaryName: String, agentId: String) {
            val wrapper = binDir.resolve(binaryName)
            Files.writeString(
                wrapper,
                """
                #!/bin/sh
                HAROLD_FAKE_ACP_AGENT_ID=$agentId \
                HAROLD_FAKE_ACP_STATE_DIR=$stateDir \
                HAROLD_FAKE_ACP_LOG=${tempDir.resolve("fake-acp.log")} \
                  exec ${python} ${fakeAgent.toAbsolutePath()}
                """.trimIndent() + "\n",
            )
            wrapper.toFile().setExecutable(true)
        }
        writeAgent("opencode", "opencode")
        writeAgent("amp-acp", "amp-acp")

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
        val catalog = AcpSessionCatalog()
        val transport = JschSshConnectionFactory()
        connectionPool = JschSshConnectionPool(repository, transport)
        val connections = HostConnections(repository, connectionPool)
        val launcher = SshAgentProcessLauncher(connections)
        runtime = AgentRuntime(
            launcher = launcher,
            files = SshSessionFileService(connections),
            catalog = catalog,
        )
        acpApi = DefaultAcpAgentApi(
            runtime = runtime,
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
        if (::runtime.isInitialized) {
            runBlocking { runtime.closeConnection(connectionId) }
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

        step("createSessions")
        val cwd = Files.createTempDirectory(Path.of("/tmp/opencode"), "harold-work")
        val createdA = acpApi.createSession(
            connectionId,
            harold.android.contracts.CreateSessionBody(agentId = "opencode", cwd = cwd.toString()),
        ).getOrThrow()
        val createdB = acpApi.createSession(
            connectionId,
            harold.android.contracts.CreateSessionBody(agentId = "opencode", cwd = cwd.toString()),
        ).getOrThrow()
        val ampCwd = Files.createTempDirectory(Path.of("/tmp/opencode"), "harold-amp")
        val ampCreated = acpApi.createSession(
            connectionId,
            harold.android.contracts.CreateSessionBody(agentId = "amp-acp", cwd = ampCwd.toString()),
        ).getOrThrow()

        // Ids are generated by the agent, not read from a fixed test fixture.
        assertTrue(createdA.sessionId.startsWith("ses_opencode_"))
        assertTrue(createdB.sessionId.startsWith("ses_opencode_"))
        assertTrue(ampCreated.sessionId.startsWith("ses_amp-acp_"))
        assertTrue(createdA.sessionId != createdB.sessionId)
        assertTrue(createdA.configOptions.isNotEmpty())
        assertTrue(ampCreated.configOptions.isNotEmpty())

        // The list is compiled from ACP session/list across both agents. The
        // app writes no per-session file on the host.
        val sessions = acpApi.listSessions(connectionId).getOrThrow()
        assertTrue(
            sessions.items.any { session ->
                session.agentId == "opencode" && session.sessionId == createdA.sessionId
            },
        )
        assertTrue(
            sessions.items.any { session ->
                session.agentId == "opencode" && session.sessionId == createdB.sessionId
            },
        )
        assertTrue(
            sessions.items.any { session ->
                session.agentId == "amp-acp" && session.sessionId == ampCreated.sessionId
            },
        )
        val filtered = acpApi.listSessions(connectionId, cwd.toString()).getOrThrow()
        assertTrue(filtered.items.all { session -> session.cwd == cwd.toString() })
        assertFalse(Files.exists(sessionMetadataPath(createdA.sessionId)))
        assertFalse(Files.exists(tempDir.resolve("home/.harold/sessions")))
        assertFalse(Files.exists(tempDir.resolve("home/.harold/workspaces.json")))

        // Warm-up is done: every later management call, stream open, and
        // prompt must reuse this one process and this one SSH connection.
        val authAfterWarmup = authCount()
        val startsAfterWarmup = processStarts("opencode")
        val initializesAfterWarmup = initializeCount("opencode")
        assertEquals(1, startsAfterWarmup)
        assertEquals(1, initializesAfterWarmup)

        step("open A then B then A again")
        val openedA = runtime.openSession(connectionId, "opencode", createdA.sessionId).getOrThrow()
        val openedB = runtime.openSession(connectionId, "opencode", createdB.sessionId).getOrThrow()
        val reopenedA = runtime.openSession(connectionId, "opencode", createdA.sessionId).getOrThrow()
        assertTrue(openedA !== openedB)
        assertTrue(openedA === reopenedA)
        assertEquals(startsAfterWarmup, processStarts("opencode"))
        assertEquals(initializesAfterWarmup, initializeCount("opencode"))

        step("attach A and B")
        val streamA = attachSession("opencode", createdA.sessionId)
        val streamB = attachSession("opencode", createdB.sessionId)

        // Every stream open is a full replay and must start with a reset, so
        // the stream owner clears what it holds before the replay lands.
        assertTrue(streamA.frames.first() is SessionStreamServerMessage.StreamReset)
        assertTrue(streamB.frames.first() is SessionStreamServerMessage.StreamReset)

        step("prompt A and B")
        acpApi.prompt(
            connectionId,
            "opencode",
            createdA.sessionId,
            PromptRequestBody(text = "hello A"),
        ).getOrThrow()
        acpApi.prompt(
            connectionId,
            "opencode",
            createdB.sessionId,
            PromptRequestBody(text = "hello B"),
        ).getOrThrow()

        val permissionA = withTimeout(30_000) { streamA.permission.await() }
        val permissionB = withTimeout(30_000) { streamB.permission.await() }
        assertEquals(createdA.sessionId, permissionA.sessionId)
        assertEquals(createdB.sessionId, permissionB.sessionId)
        acpApi.replyPermission(connectionId, permissionA.requestId, "allow").getOrThrow()
        acpApi.replyPermission(connectionId, permissionB.requestId, "allow").getOrThrow()
        withTimeout(30_000) { streamA.complete.await() }
        withTimeout(30_000) { streamB.complete.await() }

        assertTranscript(
            streamA,
            createdA.sessionId,
            "permission answered",
            "terminal result received",
            "hello from fake acp",
        )
        assertTranscript(
            streamB,
            createdB.sessionId,
            "permission answered",
            "terminal result received",
            "hello from fake acp",
        )
        // session_info_update is translated to the stream's session_info
        // frame, so the live title map follows the agent without a file.
        awaitFrame(streamA) { message ->
            message is SessionStreamServerMessage.SessionInfo &&
                message.sessionId == createdA.sessionId &&
                message.title == "Fake titled session"
        }
        assertEquals(2, methodCount("opencode", "session/prompt"))
        assertEquals(1, processStarts("opencode"))
        assertEquals(1, initializeCount("opencode"))

        step("refresh list repeatedly")
        val startsBeforeRefresh = processStarts("opencode")
        val initializesBeforeRefresh = initializeCount("opencode")
        val authBeforeRefresh = authCount()
        repeat(2) {
            val refreshed = acpApi.listSessions(connectionId).getOrThrow()
            assertTrue(
                refreshed.items.any { session ->
                    session.agentId == "opencode" && session.sessionId == createdA.sessionId
                },
            )
            assertTrue(
                refreshed.items.any { session ->
                    session.agentId == "opencode" && session.sessionId == createdB.sessionId
                },
            )
            assertTrue(
                refreshed.items.any { session ->
                    session.agentId == "amp-acp" && session.sessionId == ampCreated.sessionId
                },
            )
        }
        assertEquals(startsBeforeRefresh, processStarts("opencode"))
        assertEquals(initializesBeforeRefresh, initializeCount("opencode"))
        assertEquals(authBeforeRefresh, authCount())

        step("close and reopen B")
        streamB.stop()
        val loadsBeforeB = methodCount("opencode", "session/load")
        val reopenedB = attachSession("opencode", createdB.sessionId)
        withTimeout(30_000) { reopenedB.replayed.await() }
        assertTranscript(
            reopenedB,
            createdB.sessionId,
            "hello B",
            "hello from fake acp",
            "replayed history",
        )
        assertEquals(loadsBeforeB + 1, methodCount("opencode", "session/load"))
        assertEquals(1, processStarts("opencode"))
        assertEquals(1, initializeCount("opencode"))

        streamA.stop()
        reopenedB.stop()

        step("restart opencode")
        val startsBeforeRestart = processStarts("opencode")
        acpApi.restartAgent(connectionId, "opencode").getOrThrow()
        assertEquals(startsBeforeRestart, processStarts("opencode"))
        assertTrue(openedA.isClosed)

        val loadsBeforeRestartOpen = methodCount("opencode", "session/load")
        val restartedA = attachSession("opencode", createdA.sessionId)
        withTimeout(30_000) { restartedA.replayed.await() }
        assertTranscript(
            restartedA,
            createdA.sessionId,
            "hello A",
            "hello from fake acp",
            "replayed history",
        )
        assertEquals(startsBeforeRestart + 1, processStarts("opencode"))
        assertEquals(2, initializeCount("opencode"))
        assertEquals(loadsBeforeRestartOpen + 1, methodCount("opencode", "session/load"))
        assertEquals(1, processStarts("amp-acp"))
        assertEquals(1, initializeCount("amp-acp"))
        // A restart is a new process, not a second one running alongside.
        assertEquals(2, processPids("opencode").distinct().size)

        restartedA.stop()

        step("delete A, B still lists")
        acpApi.deleteSession(connectionId, "opencode", createdA.sessionId).getOrThrow()
        assertFalse(Files.exists(sessionMetadataPath(createdA.sessionId)))
        val afterDeleteA = acpApi.listSessions(connectionId).getOrThrow()
        assertFalse(
            afterDeleteA.items.any { session ->
                session.agentId == "opencode" && session.sessionId == createdA.sessionId
            },
        )
        assertTrue(
            afterDeleteA.items.any { session ->
                session.agentId == "opencode" && session.sessionId == createdB.sessionId
            },
        )
        assertTrue(
            afterDeleteA.items.any { session ->
                session.agentId == "amp-acp" && session.sessionId == ampCreated.sessionId
            },
        )

        step("delete B")
        acpApi.deleteSession(connectionId, "opencode", createdB.sessionId).getOrThrow()
        val afterDeleteB = acpApi.listSessions(connectionId).getOrThrow()
        assertFalse(
            afterDeleteB.items.any { session ->
                session.agentId == "opencode" && session.sessionId == createdB.sessionId
            },
        )
        assertTrue(
            afterDeleteB.items.any { session ->
                session.agentId == "amp-acp" && session.sessionId == ampCreated.sessionId
            },
        )

        // Everything above reused the two warm processes and their one SSH
        // connection; only the restart started a new process.
        assertEquals(2, processStarts("opencode"))
        assertEquals(2, initializeCount("opencode"))
        assertEquals(1, processStarts("amp-acp"))
        assertEquals(1, initializeCount("amp-acp"))
        assertEquals(authAfterWarmup, authCount())
        assertEquals(2, methodCount("opencode", "session/delete"))
        assertTrue(methodCount("opencode", "session/list") >= 3)
        assertTrue(methodCount("opencode", "session/load") >= 2)
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

    private suspend fun attachSession(
        agentId: String,
        sessionId: String,
        cwd: String? = null,
    ): AttachedStream {
        val session = runtime.openSession(connectionId, agentId, sessionId, cwd).getOrThrow()
        val subscription = session.attach()
        val frames = CopyOnWriteArrayList<SessionStreamServerMessage>()
        val subscribed = CompletableDeferred<Unit>()
        val permission = CompletableDeferred<SessionStreamServerMessage.PermissionRequest>()
        val complete = CompletableDeferred<Unit>()
        val replayed = CompletableDeferred<Unit>()
        val collector = scope.launch {
            subscription.events.collect { message ->
                frames += message
                when (message) {
                    is SessionStreamServerMessage.Subscribed -> subscribed.complete(Unit)
                    is SessionStreamServerMessage.PermissionRequest -> permission.complete(message)
                    is SessionStreamServerMessage.PromptComplete -> complete.complete(Unit)
                    is SessionStreamServerMessage.SessionUpdate ->
                        if (message.update.toString().contains("replayed history")) {
                            replayed.complete(Unit)
                        }
                    else -> Unit
                }
            }
        }
        try {
            withTimeout(30_000) { subscribed.await() }
        } catch (error: Throwable) {
            subscription.detach()
            collector.cancel()
            throw error
        }
        return AttachedStream(
            subscription = subscription,
            frames = frames,
            collector = collector,
            permission = permission,
            complete = complete,
            replayed = replayed,
        )
    }

    /**
     * Notifications are dispatched on separate coroutines, so a prompt's
     * response can land before every update it triggered reaches a stream.
     */
    private suspend fun assertTranscript(
        stream: AttachedStream,
        expectedSessionId: String,
        vararg expectedText: String,
    ) {
        withTimeout(30_000) {
            while (true) {
                val updates = stream.frames
                    .filterIsInstance<SessionStreamServerMessage.SessionUpdate>()
                val wrong = updates.firstOrNull { update ->
                    update.sessionId != expectedSessionId
                }
                if (wrong != null) {
                    error("an update for ${wrong.sessionId} landed on $expectedSessionId")
                }
                val text = updates.joinToString(" ") { update -> update.update.toString() }
                if (expectedText.all { expected -> text.contains(expected) }) {
                    return@withTimeout
                }
                delay(10)
            }
        }
    }

    private suspend fun awaitFrame(
        stream: AttachedStream,
        predicate: (SessionStreamServerMessage) -> Boolean,
    ) {
        withTimeout(30_000) {
            while (true) {
                if (stream.frames.any(predicate)) {
                    return@withTimeout
                }
                delay(10)
            }
        }
    }

    private fun fakeLogLines(): List<String> {
        val file = tempDir.resolve("fake-acp.log").toFile()
        if (!file.exists()) return emptyList()
        return runCatching { file.readLines() }.getOrDefault(emptyList())
    }

    private fun processStarts(agentId: String): Int =
        fakeLogLines().count { line -> line.startsWith("process_start agent=$agentId ") }

    private fun processPids(agentId: String): List<String> =
        fakeLogLines()
            .filter { line -> line.startsWith("process_start agent=$agentId ") }
            .map { line -> line.substringAfter("pid=") }

    private fun initializeCount(agentId: String): Int = methodCount(agentId, "initialize")

    private fun methodCount(agentId: String, method: String): Int =
        fakeLogLines().count { line -> line.startsWith("recv agent=$agentId method=$method ") }

    private fun authCount(): Int {
        val file = tempDir.resolve("ssh-server.log").toFile()
        if (!file.exists()) return 0
        return runCatching { file.readLines() }.getOrDefault(emptyList())
            .count { line -> line.contains("auth publickey") }
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

    private class AttachedStream(
        val subscription: AcpSessionSubscription,
        val frames: MutableList<SessionStreamServerMessage>,
        val collector: Job,
        val permission: CompletableDeferred<SessionStreamServerMessage.PermissionRequest>,
        val complete: CompletableDeferred<Unit>,
        val replayed: CompletableDeferred<Unit>,
    ) {
        fun stop() {
            subscription.detach()
            collector.cancel()
        }
    }
}
