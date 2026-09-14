package server.agent.android.chat.composer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test
import server.agent.android.contracts.BooleanOption
import server.agent.android.contracts.ConfigOptionValue
import server.agent.android.contracts.SelectOption

class ComposerConfigUiTest {
    @Test
    fun mapsReservedOptionsByCategory() {
        val config = composerConfigOf(
            listOf(
                select(id = "model", category = "model", currentValue = "m1"),
                select(id = "mode", category = "mode", currentValue = "agent"),
                select(id = "thought", category = "thought_level", currentValue = "low"),
                select(id = "other", category = "temperature", currentValue = "hot"),
            ),
        )

        assertEquals("model", config.model?.id)
        assertEquals("mode", config.mode?.id)
        assertEquals("thought", config.thinking?.id)
        assertNull(config.error)
        assertFalse(config.saving)
    }

    @Test
    fun surfacesBooleanReservedOptionForTheUiToNarrow() {
        val config = composerConfigOf(
            listOf(
                BooleanOption(
                    id = "mode",
                    name = "Mode",
                    category = "mode",
                    currentValue = true,
                ),
            ),
        )

        assertEquals("mode", config.mode?.id)
    }

    @Test
    fun emptyOptionsGiveAnEmptyConfig() {
        val config = composerConfigOf(emptyList())

        assertNull(config.model)
        assertNull(config.mode)
        assertNull(config.thinking)
        assertNull(config.error)
        assertFalse(config.saving)
    }

    private fun select(id: String, category: String?, currentValue: String): SelectOption = SelectOption(
        id = id,
        name = id,
        category = category,
        currentValue = currentValue,
        options = listOf(ConfigOptionValue(value = currentValue, name = currentValue)),
    )
}
