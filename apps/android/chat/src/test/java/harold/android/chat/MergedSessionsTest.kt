package harold.android.chat

import harold.android.contracts.SessionState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class MergedSessionsTest {
    @Test
    fun listsEveryHaroldNewestFirstWithItsNameColorAndIcon() {
        val rows = mergedSessionRows(
            listOf(
                haroldGroup(
                    origin = "http://laptop.local:3847",
                    name = "laptop",
                    colorId = "tide",
                    iconId = "bolt",
                    sessions = listOf(session("sess_laptop", "Alpha", "2026-08-02T00:00:00.000Z")),
                ),
                haroldGroup(
                    origin = "http://desktop.local:3847",
                    name = "desktop",
                    colorId = "ink",
                    iconId = "mark",
                    sessions = listOf(session("sess_desktop", "Alpha", "2026-08-03T00:00:00.000Z")),
                ),
            ),
        )

        assertEquals(listOf("desktop", "laptop"), rows.map { row -> row.haroldName })
        assertEquals(listOf("Alpha", "Alpha"), rows.map { row -> row.name })
        assertEquals("ink", rows[0].haroldColorId)
        assertEquals("mark", rows[0].haroldIconId)
        assertEquals("tide", rows[1].haroldColorId)
        assertEquals("bolt", rows[1].haroldIconId)
        assertNotEquals(rows[0].id, rows[1].id)
    }

    @Test
    fun choosingOneHaroldOnlyHidesTheOtherRows() {
        val all = mergedSessionRows(
            listOf(
                haroldGroup(
                    origin = "http://laptop.local:3847",
                    name = "laptop",
                    colorId = "tide",
                    iconId = "bolt",
                    sessions = listOf(session("sess_laptop", "Alpha", "2026-08-03T00:00:00.000Z")),
                ),
                haroldGroup(
                    origin = "http://desktop.local:3847",
                    name = "desktop",
                    colorId = "ink",
                    iconId = "mark",
                    sessions = listOf(session("sess_desktop", "Beta", "2026-08-02T00:00:00.000Z")),
                ),
            ),
        )

        val visible = visibleSessionRows(all, "http://laptop.local:3847")

        assertEquals(listOf("Alpha"), visible.map { row -> row.name })
        assertEquals(listOf("Alpha", "Beta"), visibleSessionRows(all, null).map { row -> row.name })
    }

    @Test
    fun unreachableHaroldStaysInTheListMarkedUnreachable() {
        val rows = mergedSessionRows(
            listOf(
                haroldGroup(
                    origin = "http://laptop.local:3847",
                    name = "laptop",
                    colorId = "tide",
                    iconId = "bolt",
                    reachable = false,
                    sessions = listOf(session("sess_laptop", "Alpha", "2026-08-03T00:00:00.000Z")),
                ),
            ),
        )

        assertEquals("Alpha", rows.single().name)
        assertEquals(false, rows.single().haroldReachable)
    }
}

private fun haroldGroup(
    origin: String,
    name: String,
    colorId: String,
    iconId: String,
    reachable: Boolean = true,
    sessions: List<SessionRow>,
) = HaroldSessionGroup(
    serverOrigin = origin,
    haroldName = name,
    colorId = colorId,
    iconId = iconId,
    reachable = reachable,
    sessions = sessions,
)

private fun session(id: String, title: String, updatedAt: String) = SessionRow(
    sessionId = id,
    name = title,
    cwd = "/tmp/harold",
    workspaceId = "ws_01",
    workspaceLabel = "harold",
    agentId = "cursor",
    agentLabel = "Cursor",
    state = SessionState.Idle,
    updatedAt = updatedAt,
)
