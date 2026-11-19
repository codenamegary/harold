package harold.android.process

import java.time.Instant
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionTitleTest {
    @Test
    fun usesTheFolderNameAndLocalTime() {
        val title = initialSessionTitle(
            cwd = "/home/user/sites/harold",
            now = Instant.parse("2026-11-18T20:15:32Z"),
            zone = ZoneId.of("UTC"),
        )

        assertEquals("harold · 20:15:32", title)
    }

    @Test
    fun fallsBackToSessionForTheRootFolder() {
        val title = initialSessionTitle(
            cwd = "/",
            now = Instant.parse("2026-11-18T20:15:32Z"),
            zone = ZoneId.of("UTC"),
        )

        assertEquals("Session · 20:15:32", title)
    }

    @Test
    fun differentCreationTimesProduceDifferentTitles() {
        val first = initialSessionTitle(
            cwd = "/home/user/sites/harold",
            now = Instant.parse("2026-11-18T20:15:32Z"),
            zone = ZoneId.of("UTC"),
        )
        val second = initialSessionTitle(
            cwd = "/home/user/sites/harold",
            now = Instant.parse("2026-11-18T20:15:33Z"),
            zone = ZoneId.of("UTC"),
        )

        assertNotEquals(first, second)
    }

    @Test
    fun recognizesGeneratedTitles() {
        assertTrue(isInitialSessionTitle("harold · 20:15:32"))
        assertTrue(isInitialSessionTitle("my project · 00:00:00"))
        assertTrue(isInitialSessionTitle("Session · 23:59:59"))
    }

    @Test
    fun rejectsTitlesThatWereNotGenerated() {
        assertFalse(isInitialSessionTitle("harold"))
        assertFalse(isInitialSessionTitle("New session"))
        assertFalse(isInitialSessionTitle("harold · 20:15"))
        assertFalse(isInitialSessionTitle("harold · 20:15:32.123"))
        assertFalse(isInitialSessionTitle(" · 20:15:32"))
        assertFalse(isInitialSessionTitle(""))
    }
}
