package server.agent.android.chat.composer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import server.agent.android.contracts.BooleanOption
import server.agent.android.contracts.ConfigOption
import server.agent.android.contracts.ConfigOptionValue
import server.agent.android.contracts.SelectOption

class SessionConfigCatalogTest {
    private val model = selectOption(id = "model", currentValue = "m1")
    private val thinking = BooleanOption(
        id = "thinking",
        name = "Thinking",
        currentValue = true,
    )

    @Test
    fun unknownSessionHasNoConfig() {
        val catalog = SessionConfigCatalog()

        assertEquals(emptyList<ConfigOption>(), catalog.current("cursor", "sess_01"))
    }

    @Test
    fun remembersConfigForASession() {
        val catalog = SessionConfigCatalog()

        catalog.remember("cursor", "sess_01", listOf(model))

        assertEquals(listOf(model), catalog.current("cursor", "sess_01"))
        assertEquals(emptyList<ConfigOption>(), catalog.current("cursor", "sess_02"))
    }

    @Test
    fun replaceOverwritesTheSessionOptions() {
        val catalog = SessionConfigCatalog()

        catalog.remember("cursor", "sess_01", listOf(model))
        catalog.remember("cursor", "sess_01", listOf(thinking))

        assertEquals(listOf(thinking), catalog.current("cursor", "sess_01"))
    }

    @Test
    fun emptyListOverwritesTheSessionOptions() {
        val catalog = SessionConfigCatalog()

        catalog.remember("cursor", "sess_01", listOf(model))
        catalog.remember("cursor", "sess_01", emptyList())

        assertEquals(emptyList<ConfigOption>(), catalog.current("cursor", "sess_01"))
    }

    @Test
    fun draftSessionIdHasNoConfig() {
        val catalog = SessionConfigCatalog()

        catalog.remember("cursor", "", listOf(model))

        assertEquals(emptyList<ConfigOption>(), catalog.current("cursor", ""))
        assertEquals(emptyList<ConfigOption>(), catalog.current("cursor", "sess_01"))
    }

    @Test
    fun missingAgentOrSessionIsEmpty() {
        val catalog = SessionConfigCatalog()
        catalog.remember("cursor", "sess_01", listOf(model))

        assertEquals(emptyList<ConfigOption>(), catalog.current(null, "sess_01"))
        assertEquals(emptyList<ConfigOption>(), catalog.current("cursor", null))
    }

    @Test
    fun forgetRemovesOneSession() {
        val catalog = SessionConfigCatalog()
        catalog.remember("cursor", "sess_01", listOf(model))
        catalog.remember("cursor", "sess_02", listOf(thinking))

        catalog.forget("cursor", "sess_01")

        assertEquals(emptyList<ConfigOption>(), catalog.current("cursor", "sess_01"))
        assertEquals(listOf(thinking), catalog.current("cursor", "sess_02"))
    }

    @Test
    fun clearDropsEverySession() {
        val catalog = SessionConfigCatalog()
        catalog.remember("cursor", "sess_01", listOf(model))
        catalog.remember("claude", "sess_09", listOf(thinking))

        catalog.clear()

        assertTrue(catalog.current("cursor", "sess_01").isEmpty())
        assertTrue(catalog.current("claude", "sess_09").isEmpty())
    }

    @Test
    fun sameSessionIdOnDifferentAgentsStaysSeparate() {
        val catalog = SessionConfigCatalog()

        catalog.remember("cursor", "sess_01", listOf(model))
        catalog.remember("claude", "sess_01", listOf(thinking))

        assertEquals(listOf(model), catalog.current("cursor", "sess_01"))
        assertEquals(listOf(thinking), catalog.current("claude", "sess_01"))
    }

    private fun selectOption(id: String, currentValue: String): SelectOption = SelectOption(
        id = id,
        name = id,
        category = "model",
        currentValue = currentValue,
        options = listOf(ConfigOptionValue(value = currentValue, name = currentValue)),
    )
}
