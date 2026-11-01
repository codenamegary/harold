package harold.android.changes

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LeadingEllipsisTextTest {
    @Test
    fun keepsTheTailAndPutsTheEllipsisOnTheLeft() {
        val result = leadingEllipsis(
            text = "abcdefghij",
            maxWidthPx = 5,
            widthOf = { candidate -> candidate.length },
        )

        assertEquals("…ghij", result)
    }

    @Test
    fun keepsFileNamesAtTheEndOfLongPaths() {
        val result = leadingEllipsis(
            text = "apps/android/changes/ChangesFeature.kt",
            maxWidthPx = 20,
            widthOf = { candidate -> candidate.length },
        )

        assertTrue(result.startsWith("…"))
        assertTrue(result.endsWith("ChangesFeature.kt"))
    }

    @Test
    fun parentDirectoryDropsTheFileName() {
        assertEquals(
            "apps/android/changes",
            parentDirectory("apps/android/changes/ChangesFeature.kt"),
        )
        assertEquals("", parentDirectory("README.md"))
    }
}
