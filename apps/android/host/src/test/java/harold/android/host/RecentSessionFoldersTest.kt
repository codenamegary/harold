package harold.android.host

import harold.android.network.SessionDirectoryHint
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RecentSessionFoldersTest {
    private fun hint(
        path: String,
        lastUsedAt: String = "2026-11-17T10:00:00Z",
        unavailable: Boolean = false,
    ) = SessionDirectoryHint(
        path = path,
        lastUsedAt = lastUsedAt,
        unavailable = unavailable,
    )

    @Test
    fun excludesSavedHiddenUnavailableAndBlankHints() {
        val selected = RecentSessionFolders.select(
            hints = listOf(
                hint(path = "/work/saved"),
                hint(path = "/work/hidden"),
                hint(path = "/work/gone", unavailable = true),
                hint(path = "/work/undated", lastUsedAt = ""),
                hint(path = "/work/recent"),
            ),
            savedPaths = setOf("/work/saved"),
            hiddenPaths = setOf("/work/hidden"),
            limit = 10,
        )

        assertEquals(listOf("/work/recent"), selected.map { selection -> selection.path })
    }

    @Test
    fun deduplicatesByPathKeepingTheNewestUse() {
        val selected = RecentSessionFolders.select(
            hints = listOf(
                hint(path = "/work/a", lastUsedAt = "2026-11-17T09:00:00Z"),
                hint(path = "/work/a", lastUsedAt = "2026-11-17T11:00:00Z"),
            ),
            savedPaths = emptySet(),
            hiddenPaths = emptySet(),
            limit = 10,
        )

        assertEquals(1, selected.size)
        assertEquals("2026-11-17T11:00:00Z", selected.single().lastUsedAt)
    }

    @Test
    fun sortsNewestFirstAndRespectsTheLimit() {
        val selected = RecentSessionFolders.select(
            hints = listOf(
                hint(path = "/work/old", lastUsedAt = "2026-11-17T08:00:00Z"),
                hint(path = "/work/new", lastUsedAt = "2026-11-17T12:00:00Z"),
                hint(path = "/work/mid", lastUsedAt = "2026-11-17T10:00:00Z"),
            ),
            savedPaths = emptySet(),
            hiddenPaths = emptySet(),
            limit = 2,
        )

        assertEquals(listOf("/work/new", "/work/mid"), selected.map { selection -> selection.path })
    }

    @Test
    fun nonPositiveLimitKeepsEverySelectedHint() {
        val selected = RecentSessionFolders.select(
            hints = listOf(
                hint(path = "/work/a", lastUsedAt = "2026-11-17T08:00:00Z"),
                hint(path = "/work/b", lastUsedAt = "2026-11-17T09:00:00Z"),
            ),
            savedPaths = emptySet(),
            hiddenPaths = emptySet(),
            limit = 0,
        )

        assertEquals(listOf("/work/b", "/work/a"), selected.map { selection -> selection.path })
    }

    @Test
    fun emptyInputSelectsNothing() {
        val selected = RecentSessionFolders.select(
            hints = emptyList(),
            savedPaths = emptySet(),
            hiddenPaths = emptySet(),
            limit = 10,
        )

        assertTrue(selected.isEmpty())
    }

    @Test
    fun sessionFolderIdsUseTheirOwnPrefix() {
        val path = "/work/recent"
        val id = SshSessionStore.sessionFolderId(path)

        assertTrue(id.startsWith("session:"))
        assertFalse(id.startsWith("ws_"))
        assertFalse(id == SshSessionStore.stableId(path))
    }
}
