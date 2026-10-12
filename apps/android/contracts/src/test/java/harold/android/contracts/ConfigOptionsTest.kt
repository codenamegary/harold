package harold.android.contracts

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
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

    @Test
    fun parsesSelectAndBooleanElements() {
        val options = parseConfigOptions(
            listOf(
                element(
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
                ),
                element(
                    """
                    {
                      "type": "boolean",
                      "id": "thinking",
                      "name": "Thinking",
                      "currentValue": true
                    }
                    """.trimIndent(),
                ),
            ),
        )

        assertEquals(listOf("model", "thinking"), options.map { option -> option.id })
        assertEquals("m1", (options[0] as SelectOption).currentValue)
        assertTrue((options[1] as BooleanOption).currentValue)
    }

    @Test
    fun parseDropsInvalidElementsAndKeepsValidOnes() {
        val options = parseConfigOptions(
            listOf(
                element("""{"id":"raw","name":"Raw"}"""),
                element("""{"type":"slider","id":"temperature","currentValue":1}"""),
                element(
                    """
                    {
                      "type": "select",
                      "id": "mode",
                      "name": "Mode",
                      "currentValue": "ask",
                      "options": [{ "value": "ask", "name": "Ask" }]
                    }
                    """.trimIndent(),
                ),
            ),
        )

        assertEquals(listOf("mode"), options.map { option -> option.id })
    }

    @Test
    fun parseTreatsAllInvalidElementsAsEmpty() {
        assertEquals(
            emptyList<ConfigOption>(),
            parseConfigOptions(
                listOf(
                    element("""{"type":"boolean","id":"thinking"}"""),
                    element("""{"type":"select","id":"model","name":"Model","currentValue":"m1"}"""),
                ),
            ),
        )
    }

    @Test
    fun parseToleratesMetaOnOptions() {
        val options = parseConfigOptions(
            listOf(
                element(
                    """
                    {
                      "type": "select",
                      "id": "model",
                      "name": "Model",
                      "_meta": { "vendor": "x" },
                      "currentValue": "m1",
                      "options": [{ "value": "m1", "name": "M1", "_meta": null }]
                    }
                    """.trimIndent(),
                ),
            ),
        )

        assertEquals("m1", (options.single() as SelectOption).currentValue)
    }

    private fun element(json: String): JsonElement = Json.parseToJsonElement(json)

    private fun option(category: String?): SelectOption = SelectOption(
        id = "option",
        name = "Option",
        category = category,
        currentValue = "a",
        options = listOf(ConfigOptionValue(value = "a", name = "A")),
    )
}
