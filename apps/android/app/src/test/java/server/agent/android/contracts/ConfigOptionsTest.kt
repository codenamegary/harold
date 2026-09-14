package server.agent.android.contracts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ConfigOptionsTest {
    @Test
    fun decodesSelectOption() {
        val option = SessionStreamJson.decodeFromString(
            ConfigOption.serializer(),
            """
            {
              "type": "select",
              "id": "model",
              "name": "Model",
              "category": "model",
              "currentValue": "m1",
              "options": [{ "value": "m1", "name": "M1" }]
            }
            """.trimIndent(),
        )

        val select = option as SelectOption
        assertEquals("model", select.id)
        assertEquals("model", select.category)
        assertEquals("m1", select.currentValue)
        assertEquals(listOf("m1"), select.options.map { it.value })
    }

    @Test
    fun decodesBooleanOptionWithMissingOptionalFields() {
        val option = SessionStreamJson.decodeFromString(
            ConfigOption.serializer(),
            """
            {
              "type": "boolean",
              "id": "thinking",
              "name": "Thinking",
              "currentValue": true
            }
            """.trimIndent(),
        )

        val boolean = option as BooleanOption
        assertEquals("thinking", boolean.id)
        assertTrue(boolean.currentValue)
        assertNull(boolean.category)
        assertNull(boolean.description)
    }

    @Test
    fun modelCategoryMapsToModel() {
        val option = SelectOption(
            id = "model",
            name = "Model",
            category = "model",
            currentValue = "m1",
            options = listOf(ConfigOptionValue(value = "m1", name = "M1")),
        )

        assertEquals(ConfigCategory.Model, categoryOf(option))
    }

    @Test
    fun modeCategoryMapsToMode() {
        assertEquals(ConfigCategory.Mode, categoryOf(option(category = "mode")))
    }

    @Test
    fun modelConfigCategoryMapsToModelConfig() {
        assertEquals(ConfigCategory.ModelConfig, categoryOf(option(category = "model_config")))
    }

    @Test
    fun thoughtLevelCategoryMapsToThoughtLevel() {
        assertEquals(ConfigCategory.ThoughtLevel, categoryOf(option(category = "thought_level")))
    }

    @Test
    fun nullCategoryMapsToOther() {
        assertEquals(ConfigCategory.Other, categoryOf(option(category = null)))
    }

    @Test
    fun underscorePrefixedCategoryMapsToOther() {
        assertEquals(ConfigCategory.Other, categoryOf(option(category = "_custom")))
    }

    @Test
    fun unknownCategoryMapsToOther() {
        assertEquals(ConfigCategory.Other, categoryOf(option(category = "temperature")))
    }

    private fun option(category: String?): SelectOption = SelectOption(
        id = "option",
        name = "Option",
        category = category,
        currentValue = "a",
        options = listOf(ConfigOptionValue(value = "a", name = "A")),
    )
}
