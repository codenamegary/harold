package harold.android.host

import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Runs the packaged host script with two attached clients. The fake agent
 * asks the client for input, so these tests cover which client receives the
 * question, which client may answer it, and whether a pending question
 * survives a reconnect.
 */
class HostAgentRoutingTest {
    private lateinit var tempDir: Path
    private lateinit var hostScript: Path
    private lateinit var fakeAgent: Path
    private lateinit var runDir: Path
    private lateinit var stateDir: Path
    private val clients = mutableListOf<Client>()
    private var host: Process? = null

    @Before
    fun setUp() {
        tempDir = Files.createTempDirectory("harold-host-routing")
        hostScript = tempDir.resolve("harold-agent.sh")
        Files.writeString(hostScript, hostAgentScript())
        fakeAgent = tempDir.resolve("fake-routing-agent.sh")
        checkNotNull(javaClass.getResourceAsStream("/fake-routing-agent.sh")).use { input ->
            Files.copy(input, fakeAgent, java.nio.file.StandardCopyOption.REPLACE_EXISTING)
        }
        fakeAgent.toFile().setExecutable(true)
        runDir = tempDir.resolve("run")
        stateDir = tempDir.resolve("state")
        Files.createDirectories(stateDir)
        startHost()
    }

    @After
    fun tearDown() {
        clients.forEach { client -> runCatching { client.close() } }
        runCatching {
            ProcessBuilder("sh", hostScript.toString(), "stop", AGENT)
                .apply { environment().putAll(hostEnvironment()) }
                .redirectErrorStream(true)
                .redirectOutput(tempDir.resolve("stop.log").toFile())
                .start()
                .waitFor(10, TimeUnit.SECONDS)
        }
        host?.let { process ->
            if (process.isAlive) {
                process.destroy()
                process.waitFor(5, TimeUnit.SECONDS)
            }
        }
        if (::tempDir.isInitialized) {
            tempDir.toFile().deleteRecursively()
        }
    }

    @Test
    fun elicitationIsShownOnlyToTheOwningClient() {
        assertSingleOwner(promptText = "elicit", requestId = "q1")
    }

    @Test
    fun permissionIsShownOnlyToTheOwningClient() {
        assertSingleOwner(promptText = "permission", requestId = "p1")
    }

    @Test
    fun reconnectReplaysAPendingQuestionToTheNewClient() {
        assertReconnectReplays("session/load")
    }

    @Test
    fun resumeReplaysAPendingQuestionToTheNewClient() {
        assertReconnectReplays("session/resume")
    }

    @Test
    fun aSecondClientClosingDoesNotCancelTheQuestion() {
        val a = connect("client-a")
        val b = connect("client-b")
        newSession(a)

        prompt(a, requestId = "a-prompt", text = "elicit")
        a.awaitLine("the question did not arrive") { line -> line.contains("\"id\":\"q1\"") }

        b.close()
        clients.remove(b)

        a.respond(elicitResult())
        a.awaitLine("the question could not be answered after B closed") { line ->
            line.contains("\"id\":\"a-prompt\"") && line.contains("end_turn")
        }

        assertEquals(listOf("answer q1"), answers())
        assertTrue(cancels().isEmpty())
    }

    private fun assertReconnectReplays(method: String) {
        val first = connect("client-a")
        newSession(first)
        prompt(first, requestId = "a-prompt", text = "elicit")
        first.awaitLine("the question did not arrive") { line -> line.contains("\"id\":\"q1\"") }

        first.close()
        clients.remove(first)

        val second = connect("client-a2")
        second.send(
            """{"jsonrpc":"2.0","id":"a2-load","method":"$method","params":{"sessionId":"ses_one","cwd":"/tmp","mcpServers":[]}}""",
        )
        second.awaitLine("the pending question was not replayed") { line ->
            line.contains("\"id\":\"q1\"")
        }

        second.respond(elicitResult())
        second.awaitLine("the replayed answer did not finish the turn") { line ->
            line.contains("\"id\":\"a-prompt\"") && line.contains("end_turn")
        }

        assertEquals(listOf("answer q1"), answers())
        assertFalse(errLog().contains("Got response to unknown request"))
    }

    private fun assertSingleOwner(promptText: String, requestId: String) {
        val a = connect("client-a")
        val b = connect("client-b")
        newSession(a)

        prompt(a, requestId = "a-prompt", text = promptText)
        a.awaitLine("the request did not arrive at the owner") { line ->
            line.contains("\"id\":\"$requestId\"")
        }
        b.assertNoLine(requestId)

        b.respond(if (requestId == "p1") permissionResult() else elicitResult())
        Thread.sleep(400)
        assertEquals(emptyList<String>(), answers())

        a.respond(if (requestId == "p1") permissionResult() else elicitResult())
        a.awaitLine("the prompt did not complete") { line ->
            line.contains("\"id\":\"a-prompt\"") && line.contains("end_turn")
        }

        assertEquals(listOf("answer $requestId"), answers())
        assertFalse(errLog().contains("Got response to unknown request"))
    }

    private fun startHost() {
        host = ProcessBuilder(
            "sh",
            hostScript.toString(),
            "host",
            AGENT,
            "exec sh ${quote(fakeAgent.toString())}",
        )
            .apply { environment().putAll(hostEnvironment()) }
            .redirectErrorStream(false)
            .redirectOutput(tempDir.resolve("host.out").toFile())
            .redirectError(tempDir.resolve("host.err").toFile())
            .start()
        await("agent host did not become ready") {
            Files.isRegularFile(runDir.resolve(AGENT).resolve("ready")) &&
                Files.isRegularFile(runDir.resolve(AGENT).resolve("logs").resolve("active"))
        }
    }

    private fun connect(clientId: String): Client {
        val process = ProcessBuilder(
            "sh",
            hostScript.toString(),
            "connect",
            AGENT,
            "exec sh ${quote(fakeAgent.toString())}",
            "-1",
            clientId,
        )
            .apply { environment().putAll(hostEnvironment()) }
            .redirectError(tempDir.resolve("client-$clientId.err").toFile())
            .start()
        val client = Client(process)
        clients += client
        client.awaitLine("client $clientId did not receive the host initialize response") { line ->
            line.contains("harold-host-init")
        }
        return client
    }

    private fun newSession(client: Client) {
        client.send(
            """{"jsonrpc":"2.0","id":"a-new","method":"session/new","params":{"cwd":"/tmp","mcpServers":[]}}""",
        )
        client.awaitLine("session/new did not answer") { line ->
            line.contains("\"id\":\"a-new\"") && line.contains("ses_one")
        }
    }

    private fun prompt(client: Client, requestId: String, text: String) {
        client.send(
            """{"jsonrpc":"2.0","id":"$requestId","method":"session/prompt","params":{"sessionId":"ses_one","prompt":[{"type":"text","text":"$text"}]}}""",
        )
    }

    private fun elicitResult(): String =
        """{"jsonrpc":"2.0","id":"q1","result":{"action":"accept","content":{}}}"""

    private fun permissionResult(): String =
        """{"jsonrpc":"2.0","id":"p1","result":{"outcome":{"outcome":"selected","optionId":"allow"}}}"""

    private fun answers(): List<String> = readLines(stateDir.resolve("answers.log"))

    private fun cancels(): List<String> = readLines(stateDir.resolve("cancels.log"))

    private fun errLog(): String {
        val run = Files.readString(runDir.resolve(AGENT).resolve("logs").resolve("active")).trim()
        val file = runDir.resolve(AGENT).resolve("logs").resolve(run).resolve("err.log")
        return if (Files.isRegularFile(file)) Files.readString(file) else ""
    }

    private fun readLines(file: Path): List<String> =
        if (Files.isRegularFile(file)) Files.readAllLines(file) else emptyList()

    private fun hostEnvironment(): Map<String, String> = mapOf(
        "HAROLD_RUN_DIR" to runDir.toString(),
        "HAROLD_FAKE_STATE" to stateDir.toString(),
    )

    private fun await(message: String, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 10_000
        while (System.currentTimeMillis() < deadline) {
            if (condition()) return
            Thread.sleep(25)
        }
        error(message)
    }

    private fun quote(value: String): String = "'" + value.replace("'", "'\\''") + "'"

    private class Client(private val process: Process) {
        private val queue = LinkedBlockingQueue<String>()
        private val seen = CopyOnWriteArrayList<String>()
        private val reader = Thread {
            runCatching {
                process.inputStream.bufferedReader().useLines { lines ->
                    lines.forEach { line ->
                        seen += line
                        queue.put(line)
                    }
                }
            }
        }.apply {
            isDaemon = true
            start()
        }

        fun send(json: String) {
            process.outputStream.write((json + "\n").toByteArray())
            process.outputStream.flush()
        }

        fun respond(response: String) {
            send(response)
        }

        fun awaitLine(message: String, timeoutMillis: Long = 10_000, predicate: (String) -> Boolean): String {
            val deadline = System.currentTimeMillis() + timeoutMillis
            while (System.currentTimeMillis() < deadline) {
                val line = queue.poll(50, TimeUnit.MILLISECONDS) ?: continue
                if (predicate(line)) {
                    return line
                }
            }
            error("$message (lines: ${seen.joinToString(" | ")})")
        }

        fun assertNoLine(value: String, timeoutMillis: Long = 1_000) {
            val deadline = System.currentTimeMillis() + timeoutMillis
            while (System.currentTimeMillis() < deadline) {
                val line = queue.poll(50, TimeUnit.MILLISECONDS) ?: continue
                if (line.contains(value)) {
                    error("client received a request it does not own: $line")
                }
            }
        }

        fun close() {
            process.destroy()
            process.waitFor(5, TimeUnit.SECONDS)
            reader.interrupt()
        }
    }

    private companion object {
        const val AGENT = "opencode"
    }
}
