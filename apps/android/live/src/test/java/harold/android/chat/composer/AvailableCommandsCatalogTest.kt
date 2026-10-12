package harold.android.chat.composer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import harold.android.contracts.AvailableCommand

class AvailableCommandsCatalogTest {
    private val plan = AvailableCommand(name = "plan", description = "Draft a plan")
    private val review = AvailableCommand(name = "review", description = "Review the changes")

    @Test
    fun unknownSessionHasNoCommands() {
        val catalog = AvailableCommandsCatalog()

        assertEquals(emptyList<AvailableCommand>(), catalog.current("cursor", "sess_01"))
    }

    @Test
    fun remembersCommandsForASession() {
        val catalog = AvailableCommandsCatalog()

        catalog.remember("cursor", "sess_01", listOf(plan))

        assertEquals(listOf(plan), catalog.current("cursor", "sess_01"))
        assertEquals(emptyList<AvailableCommand>(), catalog.current("cursor", "sess_02"))
    }

    @Test
    fun replaceOverwritesTheSessionList() {
        val catalog = AvailableCommandsCatalog()

        catalog.remember("cursor", "sess_01", listOf(plan))
        catalog.remember("cursor", "sess_01", listOf(review))

        assertEquals(listOf(review), catalog.current("cursor", "sess_01"))
    }

    @Test
    fun draftSessionIdHasNoCommands() {
        val catalog = AvailableCommandsCatalog()

        catalog.remember("cursor", "", listOf(plan))

        assertEquals(emptyList<AvailableCommand>(), catalog.current("cursor", ""))
        assertEquals(emptyList<AvailableCommand>(), catalog.current("cursor", "sess_01"))
    }

    @Test
    fun missingAgentOrSessionIsEmpty() {
        val catalog = AvailableCommandsCatalog()
        catalog.remember("cursor", "sess_01", listOf(plan))

        assertEquals(emptyList<AvailableCommand>(), catalog.current(null, "sess_01"))
        assertEquals(emptyList<AvailableCommand>(), catalog.current("cursor", null))
    }

    @Test
    fun forgetRemovesOneSession() {
        val catalog = AvailableCommandsCatalog()
        catalog.remember("cursor", "sess_01", listOf(plan))
        catalog.remember("cursor", "sess_02", listOf(review))

        catalog.forget("cursor", "sess_01")

        assertEquals(emptyList<AvailableCommand>(), catalog.current("cursor", "sess_01"))
        assertEquals(listOf(review), catalog.current("cursor", "sess_02"))
    }

    @Test
    fun clearDropsEverySession() {
        val catalog = AvailableCommandsCatalog()
        catalog.remember("cursor", "sess_01", listOf(plan))
        catalog.remember("claude", "sess_09", listOf(review))

        catalog.clear()

        assertTrue(catalog.current("cursor", "sess_01").isEmpty())
        assertTrue(catalog.current("claude", "sess_09").isEmpty())
    }

    @Test
    fun sameSessionIdOnDifferentAgentsStaysSeparate() {
        val catalog = AvailableCommandsCatalog()

        catalog.remember("cursor", "sess_01", listOf(plan))
        catalog.remember("claude", "sess_01", listOf(review))

        assertEquals(listOf(plan), catalog.current("cursor", "sess_01"))
        assertEquals(listOf(review), catalog.current("claude", "sess_01"))
    }
}
