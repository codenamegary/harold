package harold.android.host

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermission
import java.nio.file.attribute.PosixFilePermissions
import java.util.concurrent.TimeUnit
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test

/**
 * Runs the packaged host script on the local machine with a tiny shell ACP
 * agent. This covers the run directory lifecycle without an SSH server.
 */
class HostLogScriptTest {
    private lateinit var tempDir: Path
    private lateinit var hostScript: Path
    private lateinit var fakeAgent: Path
    private lateinit var runDir: Path
    private val hosts = mutableListOf<Process>()

    @Before
    fun setUp() {
        tempDir = Files.createTempDirectory("harold-host-logs")
        hostScript = tempDir.resolve("harold-agent.sh")
        Files.writeString(hostScript, hostAgentScript())
        fakeAgent = tempDir.resolve("fake-agent.sh")
        Files.writeString(
            fakeAgent,
            """
            #!/bin/sh
            while IFS= read -r line; do
                case "${'$'}line" in
                    *harold-host-init*)
                        printf '%s\n' '{"jsonrpc":"2.0","id":"harold-host-init","result":{"protocolVersion":1}}'
                        ;;
                esac
            done
            """.trimIndent() + "\n",
        )
        fakeAgent.toFile().setExecutable(true)
        runDir = tempDir.resolve("run")
    }

    @After
    fun tearDown() {
        runCatching { runScript("stop", AGENT) }
        hosts.forEach { process ->
            if (process.isAlive) {
                process.destroy()
                process.waitFor(2, TimeUnit.SECONDS)
            }
            if (process.isAlive) {
                process.destroyForcibly()
            }
        }
        if (::tempDir.isInitialized) {
            tempDir.toFile().deleteRecursively()
        }
    }

    @Test
    fun aSecondHostStartCreatesANewRunAndLeavesTheFirstUntouched() {
        val firstHost = startHost()
        val firstId = activeRunId()
        val firstOut = runOut(firstId)
        val firstErr = runErr(firstId)
        val firstBytes = Files.readAllBytes(firstOut)
        assertTrue(firstBytes.isNotEmpty())

        assertEquals(setOf(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE), permissions(firstOut))
        assertEquals(setOf(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE), permissions(firstErr))
        assertEquals(ownerOnlyDirectory(), permissions(firstOut.parent))
        assertEquals(ownerOnlyDirectory(), permissions(firstOut.parent.parent))

        val listed = runScript("logs")
        val line = listed.lineSequence().first { line -> line.contains("\t$firstId\t") }
        val fields = line.split('\t')
        assertEquals("run", fields[0])
        assertEquals(AGENT, fields[1])
        assertEquals(firstId, fields[2])
        assertEquals(firstBytes.size.toString(), fields[3])
        assertEquals("1", fields[5])
        assertEquals("1", fields[6])

        stopHost(firstHost)
        assertArrayEquals(firstBytes, Files.readAllBytes(firstOut))

        val secondHost = startHost()
        val secondId = activeRunId()
        assertNotEquals(firstId, secondId)
        assertTrue(Files.isRegularFile(runOut(secondId)))
        assertArrayEquals(firstBytes, Files.readAllBytes(firstOut))

        stopHost(secondHost)

        assertEquals(2, runDirs().size)
        assertTrue(Files.isRegularFile(firstOut))
        assertArrayEquals(firstBytes, Files.readAllBytes(firstOut))
    }

    @Test
    fun aReconnectReusesTheLiveRun() {
        val host = startHost()
        val id = activeRunId()
        val runsBefore = runDirs().size

        val connect = ProcessBuilder(
            "sh",
            hostScript.toString(),
            "connect",
            AGENT,
            "exec sh ${quote(fakeAgent.toString())}",
            "-1",
        )
            .redirectErrorStream(true)
            .apply { environment()["HAROLD_RUN_DIR"] = runDir.toString() }
            .start()
        try {
            val replay = connect.inputStream.bufferedReader().readLine()
            assertTrue(replay.orEmpty().contains("harold-host-init"))
            assertEquals(runsBefore, runDirs().size)
            assertEquals(id, activeRunId())
        } finally {
            connect.destroy()
            connect.waitFor(5, TimeUnit.SECONDS)
        }

        stopHost(host)
    }

    @Test
    fun logsReportsEveryRunWithBytesAndState() {
        writeActive(ACTIVE_RUN)
        fakeRun(OLD_RUN, out = "0123456789", err = "abcde")
        fakeRun(ACTIVE_RUN, out = "1234", err = "56")
        fakeRun(NEWEST_RUN, out = "7", err = "")

        val lines = runScript("logs").lineSequence().filter { it.isNotBlank() }.toList()
        assertEquals(3, lines.size)

        assertFields(fields(lines, OLD_RUN), out = 10, err = 5, active = 0, running = 0)
        assertFields(fields(lines, ACTIVE_RUN), out = 4, err = 2, active = 1, running = 0)
        assertFields(fields(lines, NEWEST_RUN), out = 1, err = 0, active = 0, running = 0)
    }

    @Test
    fun cleanupDeletesInactiveRunsButKeepsActiveAndNewestRuns() {
        writeActive(ACTIVE_RUN)
        fakeRun(OLD_RUN, out = "0123456789", err = "abcde")
        fakeRun(ACTIVE_RUN, out = "1234", err = "56")
        fakeRun(NEWEST_RUN, out = "7", err = "")

        val invalid = logsDir().resolve("not-a-run")
        Files.createDirectories(invalid)
        Files.writeString(invalid.resolve("out.jsonl"), "keep me")

        assertEquals("cleanup\t1\t15", runScript("cleanup", "all-inactive").trim())

        assertFalse(Files.exists(runDirFor(OLD_RUN)))
        assertTrue(Files.exists(runDirFor(ACTIVE_RUN)))
        assertTrue(Files.exists(runDirFor(NEWEST_RUN)))
        assertTrue(Files.exists(invalid))
        assertEquals(ACTIVE_RUN, activeRunId())
    }

    @Test
    fun cleanupKeepsTheNewestRunWhenTheHostCrashedBeforeMarkingItActive() {
        writeActive(OLD_RUN)
        fakeRun(OLD_RUN, out = "abc", err = "")
        fakeRun(ACTIVE_RUN, out = "1234", err = "")
        fakeRun(NEWEST_RUN, out = "7", err = "")

        assertEquals("cleanup\t1\t4", runScript("cleanup", "all-inactive").trim())

        assertTrue(Files.exists(runDirFor(OLD_RUN)))
        assertFalse(Files.exists(runDirFor(ACTIVE_RUN)))
        assertTrue(Files.exists(runDirFor(NEWEST_RUN)))
    }

    @Test
    fun cleanupRejectsAnUnknownPolicy() {
        writeActive(ACTIVE_RUN)
        fakeRun(OLD_RUN, out = "0123456789", err = "abcde")
        fakeRun(ACTIVE_RUN, out = "1234", err = "56")
        fakeRun(NEWEST_RUN, out = "7", err = "")

        val result = runScriptResult("cleanup", "everything")
        assertNotEquals(0, result.exitCode)
        assertTrue(Files.exists(runDirFor(OLD_RUN)))
    }

    @Test
    fun cleanupReportsZeroWhenNothingCanBeDeleted() {
        assertEquals("cleanup\t0\t0", runScript("cleanup", "all-inactive").trim())
    }

    private fun startHost(): Process {
        val process = ProcessBuilder(
            "sh",
            hostScript.toString(),
            "host",
            AGENT,
            "exec sh ${quote(fakeAgent.toString())}",
        )
            .redirectErrorStream(true)
            .redirectOutput(tempDir.resolve("host-${hosts.size}.log").toFile())
            .apply { environment()["HAROLD_RUN_DIR"] = runDir.toString() }
            .start()
        hosts += process
        await("agent host did not become ready") {
            Files.isRegularFile(runDir.resolve(AGENT).resolve("ready")) &&
                Files.isRegularFile(runDir.resolve(AGENT).resolve("logs").resolve("active"))
        }
        return process
    }

    private fun stopHost(process: Process) {
        runScript("stop", AGENT)
        assertTrue("host process did not exit", process.waitFor(10, TimeUnit.SECONDS))
    }

    private fun runScript(vararg args: String): String {
        val result = runScriptResult(*args)
        assertEquals("script failed: ${args.joinToString(" ")}\n${result.output}", 0, result.exitCode)
        return result.output
    }

    private fun runScriptResult(vararg args: String): ScriptResult {
        val process = ProcessBuilder(listOf("sh", hostScript.toString()) + args)
            .redirectErrorStream(true)
            .apply { environment()["HAROLD_RUN_DIR"] = runDir.toString() }
            .start()
        val output = process.inputStream.bufferedReader().readText()
        assertTrue(process.waitFor(10, TimeUnit.SECONDS))
        return ScriptResult(process.exitValue(), output)
    }

    private fun await(message: String, condition: () -> Boolean) {
        val deadline = System.currentTimeMillis() + 10_000
        while (System.currentTimeMillis() < deadline) {
            if (condition()) return
            Thread.sleep(25)
        }
        error(message)
    }

    private fun activeRunId(): String =
        Files.readString(runDir.resolve(AGENT).resolve("logs").resolve("active")).trim()

    private fun writeActive(id: String) {
        Files.createDirectories(logsDir())
        Files.writeString(logsDir().resolve("active"), "$id\n")
    }

    private fun fakeRun(id: String, out: String, err: String) {
        val dir = logsDir().resolve(id)
        Files.createDirectories(dir)
        Files.writeString(dir.resolve("out.jsonl"), out)
        Files.writeString(dir.resolve("err.log"), err)
    }

    private fun logsDir(): Path = runDir.resolve(AGENT).resolve("logs")

    private fun runDirFor(id: String): Path = logsDir().resolve(id)

    private fun runOut(id: String): Path = runDirFor(id).resolve("out.jsonl")

    private fun runErr(id: String): Path = runDirFor(id).resolve("err.log")

    private fun runDirs(): List<Path> =
        Files.list(logsDir()).use { stream ->
            stream.filter { path -> Files.isDirectory(path) && path.fileName.toString() != "active" }
                .toList()
        }

    private fun permissions(path: Path): Set<PosixFilePermission> {
        assumeTrue(Files.getFileStore(path).supportsFileAttributeView("posix"))
        return Files.getPosixFilePermissions(path)
    }

    private fun ownerOnlyDirectory(): Set<PosixFilePermission> =
        PosixFilePermissions.fromString("rwx------")

    private fun fields(lines: List<String>, id: String): List<String> =
        lines.first { line -> line.contains("\t$id\t") }.split('\t')

    private fun assertFields(
        fields: List<String>,
        out: Long,
        err: Long,
        active: Int,
        running: Int,
    ) {
        assertEquals("run", fields[0])
        assertEquals(AGENT, fields[1])
        assertEquals(out.toString(), fields[3])
        assertEquals(err.toString(), fields[4])
        assertEquals(active.toString(), fields[5])
        assertEquals(running.toString(), fields[6])
    }

    private fun quote(value: String): String = "'" + value.replace("'", "'\\''") + "'"

    private data class ScriptResult(val exitCode: Int, val output: String)

    private companion object {
        const val AGENT = "opencode"
        const val OLD_RUN = "20260101T000000Z-1"
        const val ACTIVE_RUN = "20260102T000000Z-2"
        const val NEWEST_RUN = "20260103T000000Z-3"
    }
}
