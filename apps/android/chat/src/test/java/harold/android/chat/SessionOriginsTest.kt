package harold.android.chat

import org.junit.Assert.assertEquals
import org.junit.Test

class SessionOriginsTest {
    @Test
    fun includesSavedSelectedAndWatchedOrigins() {
        assertEquals(
            listOf("saved", "selected", "watched"),
            sessionRefreshOrigins(
                saved = listOf("saved"),
                active = "active",
                selected = "selected",
                watched = "watched",
            ),
        )
    }

    @Test
    fun fallsBackToTheActiveOriginWhenNothingIsSaved() {
        assertEquals(
            listOf("active", "selected"),
            sessionRefreshOrigins(
                saved = emptyList(),
                active = "active",
                selected = "selected",
                watched = null,
            ),
        )
    }

    @Test
    fun selectedOriginSurvivesMissingMetadata() {
        assertEquals(
            listOf("selected"),
            sessionRefreshOrigins(
                saved = emptyList(),
                active = null,
                selected = "selected",
                watched = null,
            ),
        )
    }

    @Test
    fun dropsBlankAndDuplicateOrigins() {
        assertEquals(
            listOf("saved"),
            sessionRefreshOrigins(
                saved = listOf("saved", "saved", ""),
                active = "active",
                selected = "saved",
                watched = "",
            ),
        )
    }
}
