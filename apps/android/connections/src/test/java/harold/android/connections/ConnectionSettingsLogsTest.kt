package harold.android.connections

import harold.android.contracts.AgentLogs
import harold.android.contracts.HostLogs
import harold.android.contracts.LogRun
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ConnectionSettingsLogsTest {
    @Test
    fun warningStartsAbove512Megabytes() {
        assertFalse(hostLogsWarning(512L * 1024 * 1024))
        assertTrue(hostLogsWarning(512L * 1024 * 1024 + 1))
    }

    @Test
    fun cleanupPreviewKeepsTheActiveAndNewestRunForEveryAgent() {
        val logs = hostLogs(
            agent(
                id = "opencode",
                runs = listOf(
                    run("20260101T000000Z-1", out = 10),
                    run("20260102T000000Z-2", out = 20),
                    run("20260103T000000Z-3", out = 30, active = true),
                ),
                hostRunning = true,
                activeRunId = "20260103T000000Z-3",
            ),
            agent(
                id = "claude",
                runs = listOf(
                    run("20260101T000000Z-1", out = 5, active = true),
                    run("20260102T000000Z-2", out = 7),
                    run("20260103T000000Z-3", out = 11),
                ),
                hostRunning = false,
                activeRunId = "20260101T000000Z-1",
            ),
        )

        val preview = hostLogCleanupPreview(logs)

        assertEquals(3, preview.runs)
        assertEquals(37L, preview.bytes)
    }

    @Test
    fun agentsAreSortedByLogSizeDescending() {
        val logs = hostLogs(
            agent("small", runs = listOf(run("20260101T000000Z-1", out = 1))),
            agent("large", runs = listOf(run("20260101T000000Z-1", out = 100))),
            agent("medium", runs = listOf(run("20260101T000000Z-1", out = 10))),
        )

        assertEquals(
            listOf("large", "medium", "small"),
            sortedAgentLogs(logs).map { agent -> agent.agentId },
        )
    }

    @Test
    fun theActiveRunIsCurrentWhileRunningAndLatestWhenStopped() {
        val run = run("20260101T000000Z-1", out = 1, active = true)

        assertEquals(LogRunRole.Current, logRunRole(run, hostRunning = true))
        assertEquals(LogRunRole.Latest, logRunRole(run, hostRunning = false))
        assertEquals(
            LogRunRole.Past,
            logRunRole(run.copy(active = false), hostRunning = true),
        )
    }

    @Test
    fun formatsByteSizesForTheSection() {
        assertEquals("0 B", formatLogBytes(0))
        assertEquals("340 B", formatLogBytes(340))
        assertEquals("1.5 KB", formatLogBytes(1536))
        assertEquals("512 MB", formatLogBytes(512L * 1024 * 1024))
        assertEquals("1.2 GB", formatLogBytes(1288490189))
    }

    @Test
    fun formatsRunStartTimesInUtc() {
        assertEquals(
            "2026-11-17 14:25 UTC",
            formatRunStartedAt(Instant.parse("2026-11-17T14:25:30Z")),
        )
        assertEquals("Unknown start", formatRunStartedAt(null))
    }

    private fun hostLogs(vararg agents: AgentLogs): HostLogs =
        HostLogs(agents.toList(), Instant.parse("2026-11-17T15:00:00Z"))

    private fun agent(
        id: String,
        runs: List<LogRun>,
        hostRunning: Boolean = false,
        activeRunId: String? = null,
    ): AgentLogs = AgentLogs(
        agentId = id,
        displayName = null,
        hostRunning = hostRunning,
        activeRunId = activeRunId,
        runs = runs,
    )

    private fun run(
        id: String,
        out: Long = 0,
        err: Long = 0,
        active: Boolean = false,
    ): LogRun = LogRun(
        id = id,
        startedAt = null,
        outBytes = out,
        errBytes = err,
        active = active,
    )
}
