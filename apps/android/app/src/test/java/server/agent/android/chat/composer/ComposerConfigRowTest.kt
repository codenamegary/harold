package server.agent.android.chat.composer

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import server.agent.android.contracts.BooleanOption
import server.agent.android.contracts.ConfigOptionValue
import server.agent.android.contracts.SelectOption
import server.agent.android.ui.theme.AgentServerTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class ComposerConfigRowTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun rendersChipsForPresentSelectOptions() {
        setRow(
            ComposerConfigUi(
                model = modelOption(),
                mode = modeOption(),
                thinking = thinkingOption(),
            ),
        )

        composeTestRule.onNodeWithTag("composer_config_row").assertIsDisplayed()
        composeTestRule.onNodeWithTag("composer_config_model_chip").assertIsDisplayed()
        composeTestRule.onNodeWithTag("composer_config_mode_chip").assertIsDisplayed()
        composeTestRule.onNodeWithTag("composer_config_thinking_chip").assertIsDisplayed()
        composeTestRule.onNodeWithText("Claude Opus 4.5").assertIsDisplayed()
        composeTestRule.onNodeWithText("Agent").assertIsDisplayed()
        composeTestRule.onNodeWithText("High").assertIsDisplayed()
    }

    @Test
    fun omitsMissingAndBooleanOptions() {
        setRow(
            ComposerConfigUi(
                model = modelOption(),
                thinking = BooleanOption(
                    id = "thinking",
                    name = "Thinking",
                    category = "thought_level",
                    currentValue = true,
                ),
            ),
        )

        composeTestRule.onNodeWithTag("composer_config_model_chip").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("composer_config_mode_chip").assertCountEquals(0)
        composeTestRule.onAllNodesWithTag("composer_config_thinking_chip").assertCountEquals(0)
    }

    @Test
    fun rendersNothingWithoutOptions() {
        setRow(ComposerConfigUi())

        composeTestRule.onAllNodesWithTag("composer_config_row").assertCountEquals(0)
    }

    @Test
    fun modeCyclePassesNextValue() {
        var picked: ConfigOptionValue? = null
        setRow(
            ComposerConfigUi(mode = modeOption(currentValue = "agent")),
            ComposerConfigActions(onModeCycle = { picked = it }),
        )

        composeTestRule.onNodeWithTag("composer_config_mode_chip").performClick()

        assertEquals("plan", picked?.value)
    }

    @Test
    fun modeCycleWrapsAround() {
        var picked: ConfigOptionValue? = null
        setRow(
            ComposerConfigUi(mode = modeOption(currentValue = "ask")),
            ComposerConfigActions(onModeCycle = { picked = it }),
        )

        composeTestRule.onNodeWithTag("composer_config_mode_chip").performClick()

        assertEquals("agent", picked?.value)
    }

    @Test
    fun thinkingCycleStripsPrefixAndPassesNext() {
        var picked: ConfigOptionValue? = null
        setRow(
            ComposerConfigUi(thinking = thinkingOption(currentValue = "high")),
            ComposerConfigActions(onThinkingCycle = { picked = it }),
        )

        composeTestRule.onNodeWithText("High").assertIsDisplayed()
        composeTestRule.onNodeWithTag("composer_config_thinking_chip").performClick()

        assertEquals("low", picked?.value)
    }

    @Test
    fun modelSheetSearchesFiltersAndPicks() {
        var picked: String? = null
        setRow(
            ComposerConfigUi(model = modelOption()),
            ComposerConfigActions(onModelPick = { picked = it }),
        )

        composeTestRule.onNodeWithTag("composer_config_model_chip").performClick()
        composeTestRule.onNodeWithTag("composer_config_model_sheet").assertIsDisplayed()

        composeTestRule
            .onNodeWithTag("composer_config_model_search")
            .performTextInput("sonnet")
        composeTestRule.onNodeWithText("Claude Sonnet 4.5").assertIsDisplayed()
        composeTestRule.onNodeWithTag("composer_config_model_option_opus").assertDoesNotExist()

        composeTestRule
            .onNodeWithTag("composer_config_model_option_sonnet")
            .performClick()

        assertEquals("sonnet", picked)
    }

    @Test
    fun savingDisablesChips() {
        setRow(
            ComposerConfigUi(
                model = modelOption(),
                mode = modeOption(),
                thinking = thinkingOption(),
                saving = true,
            ),
        )

        composeTestRule.onNodeWithTag("composer_config_model_chip").assertIsNotEnabled()
        composeTestRule.onNodeWithTag("composer_config_mode_chip").assertIsNotEnabled()
        composeTestRule.onNodeWithTag("composer_config_thinking_chip").assertIsNotEnabled()
    }

    @Test
    fun errorRendersUnderTheRow() {
        setRow(ComposerConfigUi(model = modelOption(), error = "Agent is disabled"))

        composeTestRule.onNodeWithTag("composer_config_error").assertIsDisplayed()
        composeTestRule.onNodeWithText("Agent is disabled").assertIsDisplayed()
    }

    private fun setRow(
        config: ComposerConfigUi,
        actions: ComposerConfigActions = ComposerConfigActions(),
    ) {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ComposerConfigRow(config = config, configActions = actions)
            }
        }
    }

    private fun modelOption(): SelectOption = SelectOption(
        id = "model",
        name = "Model",
        category = "model",
        currentValue = "opus",
        options = listOf(
            ConfigOptionValue(value = "opus", name = "Claude Opus 4.5"),
            ConfigOptionValue(value = "sonnet", name = "Claude Sonnet 4.5"),
            ConfigOptionValue(value = "haiku", name = "Claude Haiku 4.5"),
        ),
    )

    private fun modeOption(currentValue: String = "agent"): SelectOption = SelectOption(
        id = "mode",
        name = "Mode",
        category = "mode",
        currentValue = currentValue,
        options = listOf(
            ConfigOptionValue(value = "agent", name = "Agent"),
            ConfigOptionValue(value = "plan", name = "Plan"),
            ConfigOptionValue(value = "ask", name = "Ask"),
        ),
    )

    private fun thinkingOption(currentValue: String = "high"): SelectOption = SelectOption(
        id = "thinking",
        name = "Thinking",
        category = "thought_level",
        currentValue = currentValue,
        options = listOf(
            ConfigOptionValue(value = "low", name = "Thinking: Low"),
            ConfigOptionValue(value = "medium", name = "Thinking: Medium"),
            ConfigOptionValue(value = "high", name = "Thinking: High"),
        ),
    )
}
