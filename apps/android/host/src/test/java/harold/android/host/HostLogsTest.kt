package harold.android.host

import harold.android.contracts.LogCleanupPolicy
import harold.android.contracts.LogCleanupResult
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HostLogsTest {
    private val fetchedAt = Instant.parse("2026-11-17T15:00:00Z")

    @Test
    fun parsesRunsGroupedByAgent() {
        val logs = parseHostLogs(
            output = """
                run	opencode	20261117T142530Z-12345	1200	34	1	1
                run	opencode	20261116T090000Z-999	10	5	0	1
                run	claude	20261117T130000Z-321	7	3	1	0
            """.trimIndent() + "\n",
            fetchedAt = fetchedAt,
            displayNames = mapOf("opencode" to "OpenCode", "claude" to "Claude Agent"),
        )

        assertEquals(fetchedAt, logs.fetchedAt)
        assertEquals(listOf("opencode", "claude"), logs.agents.map { it.agentId })

        val opencode = logs.agents.first()
        assertEquals("OpenCode", opencode.displayName)
        assertTrue(opencode.hostRunning)
        assertEquals("20261117T142530Z-12345", opencode.activeRunId)
        assertEquals(2, opencode.runs.size)
        assertEquals(
            listOf("20261117T142530Z-12345", "20261116T090000Z-999"),
            opencode.runs.map { it.id },
        )
        assertEquals(Instant.parse("2026-11-17T14:25:30Z"), opencode.runs.first().startedAt)
        assertEquals(1200L, opencode.runs.first().outBytes)
        assertEquals(34L, opencode.runs.first().errBytes)
        assertTrue(opencode.runs.first().active)
        assertEquals(1234L, opencode.runs.first().bytes)

        val claude = logs.agents.last()
        assertEquals("Claude Agent", claude.displayName)
        assertEquals(false, claude.hostRunning)
        assertEquals("20261117T130000Z-321", claude.activeRunId)
    }

    @Test
    fun ignoresMalformedLinesAndUnknownAgentsKeepANullDisplayName() {
        val logs = parseHostLogs(
            output = """
                garbage
                run	only-five	fields	1	2
                run	custom-7	20261117T142530Z-1	5	2	0	0
                run	custom-7	not-a-run-id	5	2	1	0
            """.trimIndent() + "\n",
            fetchedAt = fetchedAt,
            displayNames = emptyMap(),
        )

        assertEquals(1, logs.agents.size)
        assertEquals("custom-7", logs.agents.single().agentId)
        assertNull(logs.agents.single().displayName)
        assertEquals(1, logs.agents.single().runs.size)
        assertEquals(Instant.parse("2026-11-17T14:25:30Z"), logs.agents.single().runs.single().startedAt)
    }

    @Test
    fun parsesCleanupResultAndReturnsNullForMissingOutput() {
        assertEquals(
            LogCleanupResult(deletedRuns = 3, removedBytes = 4096),
            parseLogCleanupResult("cleanup\t3\t4096\n"),
        )
        assertEquals(
            LogCleanupResult(deletedRuns = 0, removedBytes = 0),
            parseLogCleanupResult("cleanup\t0\t0\n"),
        )
        assertNull(parseLogCleanupResult(""))
        assertNull(parseLogCleanupResult("run\topencode\t20261117T142530Z-1\t1\t1\t0\t0\n"))
    }

    @Test
    fun parsesRunStartTimesAndRejectsBadIds() {
        assertEquals(
            Instant.parse("2026-11-17T14:25:30Z"),
            parseRunStartedAt("20261117T142530Z-12345"),
        )
        assertNull(parseRunStartedAt("not-a-run-id"))
        assertNull(parseRunStartedAt("20261117T142530Z-nope"))
    }

    @Test
    fun logCommandsEmbedTheScriptAndNameTheMode() {
        val logsCommand = hostLogsCommand("echo host-script\n")
        assertTrue(logsCommand.startsWith("export HAROLD_AGENT_SCRIPT='echo host-script"))
        assertTrue(logsCommand.endsWith(" harold-agent logs"))

        val cleanupCommand = hostCleanupCommand(
            script = "echo host-script\n",
            policy = LogCleanupPolicy.AllInactive,
        )
        assertTrue(cleanupCommand.startsWith("export HAROLD_AGENT_SCRIPT='echo host-script"))
        assertTrue(cleanupCommand.endsWith(" harold-agent cleanup 'all-inactive'"))
    }
}
