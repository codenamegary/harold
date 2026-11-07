package harold.android.transport

import harold.android.contracts.PromptRequestBody
import harold.android.contracts.SessionStreamServerMessage
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.SshAuth
import harold.android.credentials.SshConfig
import harold.android.credentials.StoredCredential
import harold.android.testing.FakeCredentialStore
import harold.android.transport.ssh.SshAcpRegistry
import harold.android.transport.ssh.SshAcpSessionFactory
import harold.android.transport.ssh.SshAgentApi
import harold.android.transport.ssh.JschSshConnectionFactory
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
    private lateinit var connectionId: String
    private lateinit var repository: SavedHaroldRepository
    private lateinit var factory: SshAcpSessionFactory
    private lateinit var api: SshAgentApi

    @Before
    fun setUp() = runBlocking {
        assumeTrue(System.getenv("HAROLD_RUN_SSH_TESTS") == "1")
        val repoRoot = findRepoRoot()
        val python = System.getenv("HAROLD_SSH_TEST_PYTHON")
            ?: "/tmp/harold-ssh-venv/bin/python"
        assumeTrue(File(python).exists())

        tempDir = Files.createTempDirectory(Path.of("/tmp/opencode"), "harold-ssh-test")
        val hostKey = tempDir.resolve("hostkey")
        val binDir = tempDir.resolve("bin")
        Files.createDirectories(binDir)
        val fakeAgent = tempDir.resolve("fake-acp-agent.py")
        Files.copy(
            File(repoRoot, "scripts/fake-acp-agent.py").toPath(),
            fakeAgent,
        )
        val wrapper = binDir.resolve("opencode")
        Files.writeString(
            wrapper,
            """
            #!/bin/sh
            HAROLD_FAKE_ACP_LOG=${tempDir.resolve("fake-acp.log")} \
              exec ${python} ${fakeAgent.toAbsolutePath()}
            """.trimIndent() + "\n",
        )
        wrapper.toFile().setExecutable(true)

        val port = ServerSocket(0).use { socket -> socket.localPort }
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
        )
            .directory(File(System.getProperty("user.home")))
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
        connectionId = config.connectionId
        val saved = StoredCredential(
            formatVersion = 3,
            serverOrigin = connectionId,
            deviceName = "integration",
            name = "integration",
            colorId = "tide",
            iconId = "terminal",
            ssh = config,
        )
        repository = SavedHaroldRepository(FakeCredentialStore(saved))
        val registry = SshAcpRegistry()
        factory = SshAcpSessionFactory(repository, JschSshConnectionFactory(), registry)
        api = SshAgentApi(factory, registry)

        // The test harness can leave a lock child behind when a previous run
        // is killed. Real sshd releases it on disconnect.
        factory.useConnection(connectionId) { connection, _ ->
            connection.runCommand(
                "fuser -k ~/.harold/locks/opencode/ses_test_opencode.lock " +
                    ">/dev/null 2>&1 || true; " +
                    "rm -f ~/.harold/locks/opencode/ses_test_opencode.lock",
            )
        }
        Unit
    }

    @After
    fun tearDown() {
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
        val agents = api.listAgents(connectionId).getOrThrow()
        assertTrue(agents.items.any { agent -> agent.id == "opencode" })

        step("createSession")
        val cwd = Files.createTempDirectory(Path.of("/tmp/opencode"), "harold-work")
        val created = api.createSession(
            connectionId,
            harold.android.contracts.CreateSessionBody(agentId = "opencode", cwd = cwd.toString()),
        ).getOrThrow()
        assertEquals("ses_test_opencode", created.sessionId)
        assertTrue(created.configOptions.isNotEmpty())

        val sessions = api.listSessions(connectionId).getOrThrow()
        assertTrue(sessions.items.any { session -> session.sessionId == created.sessionId })

        val frames = mutableListOf<SessionStreamServerMessage>()
        val permission = CompletableDeferred<SessionStreamServerMessage.PermissionRequest>()
        val complete = CompletableDeferred<Unit>()
        val subscribed = CompletableDeferred<Unit>()
        step("open first")
        val session = factory.open(connectionId, "opencode", created.sessionId, scope).getOrThrow()
        step("opened first")
        val collector = scope.launch {
            session.events.collect { message ->
                frames += message
                when (message) {
                    is SessionStreamServerMessage.Subscribed -> subscribed.complete(Unit)
                    is SessionStreamServerMessage.PermissionRequest -> permission.complete(message)
                    is SessionStreamServerMessage.PromptComplete -> complete.complete(Unit)
                    else -> Unit
                }
            }
        }
        withTimeout(30_000) { subscribed.await() }

        // The lock blocks a second device while this session is active.
        step("open second")
        val second = factory.open(connectionId, "opencode", created.sessionId, scope)
        step("second failure=${second.exceptionOrNull()?.message}")
        assertTrue(second.isFailure)

        api.prompt(
            connectionId,
            "opencode",
            created.sessionId,
            PromptRequestBody(text = "hello"),
        ).getOrThrow()

        val request = withTimeout(30_000) { permission.await() }
        api.replyPermission(connectionId, request.requestId, "allow").getOrThrow()
        withTimeout(30_000) { complete.await() }

        val text = frames.filterIsInstance<SessionStreamServerMessage.SessionUpdate>()
            .joinToString(" ") { update -> update.update.toString() }
        assertTrue(text.contains("permission answered"))
        assertTrue(text.contains("terminal result received"))
        assertTrue(text.contains("hello from fake acp"))

        step("close first")
        session.close()
        collector.cancel()
        // The asyncssh test harness keeps an exec child alive after the
        // client channel closes. Real sshd releases it on disconnect.
        factory.useConnection(connectionId) { connection, _ ->
            connection.runCommand(
                "fuser -k ~/.harold/locks/opencode/ses_test_opencode.lock " +
                    ">/dev/null 2>&1 || true",
            )
        }
        kotlinx.coroutines.delay(300)
        step("reopen")
        val resumed = factory.open(connectionId, "opencode", created.sessionId, scope).getOrThrow()
        step("reopened")
        val replayed = CompletableDeferred<Unit>()
        val resumeCollector = scope.launch {
            resumed.events.collect { message ->
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

        api.deleteSession(connectionId, "opencode", created.sessionId).getOrThrow()
        assertFalse(
            Files.exists(
                Path.of(
                    System.getProperty("user.home"),
                    ".harold/sessions/opencode/${created.sessionId}.json",
                ),
            ),
        )
    }

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
