package server.agent.android.chat.composer

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
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
        composeTestRule.onNodeWithText("AGENT").assertIsDisplayed()
        // 3 bars rendered for 3 options
        composeTestRule.onNodeWithTag("composer_config_thinking_bar_0", useUnmergedTree = true).assertExists()
        composeTestRule.onNodeWithTag("composer_config_thinking_bar_1", useUnmergedTree = true).assertExists()
        composeTestRule.onNodeWithTag("composer_config_thinking_bar_2", useUnmergedTree = true).assertExists()
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
    fun rendersEmptyPlaceholdersWithoutOptions() {
        setRow(ComposerConfigUi())

        composeTestRule.onNodeWithTag("composer_config_row").assertIsDisplayed()
        composeTestRule.onNodeWithTag("composer_config_model_placeholder").assertIsDisplayed()
        composeTestRule.onNodeWithText("provider/model").assertIsDisplayed()
        composeTestRule.onNodeWithTag("composer_config_mode_placeholder").assertIsDisplayed()
        composeTestRule.onNodeWithText("mode").assertIsDisplayed()
        composeTestRule.onNodeWithTag("composer_config_thinking_placeholder").assertIsDisplayed()
        for (i in 0 until 4) {
            composeTestRule.onNodeWithTag("composer_config_thinking_placeholder_bar_$i", useUnmergedTree = true).assertExists()
        }
        composeTestRule.onAllNodesWithTag("composer_config_thinking_placeholder_bar_4", useUnmergedTree = true).assertCountEquals(0)
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
    fun thinkingCycleStripsPrefixPassesNextAndShowsToast() {
        var picked: ConfigOptionValue? = null
        setRow(
            ComposerConfigUi(thinking = thinkingOption(currentValue = "high")),
            ComposerConfigActions(onThinkingCycle = { picked = it }),
        )

        composeTestRule.onNodeWithTag("composer_config_thinking_chip").performClick()

        assertEquals("low", picked?.value)
        composeTestRule.onNodeWithTag("composer_thinking_toast").assertIsDisplayed()
        composeTestRule.onNodeWithText("Thinking set to Low").assertIsDisplayed()
    }

    @Test
    fun dynamicStepperRendersNBarsForNOptions() {
        val fiveOptions = SelectOption(
            id = "thinking",
            name = "Thinking",
            category = "thought_level",
            currentValue = "level_3",
            options = listOf(
                ConfigOptionValue(value = "level_1", name = "Level 1"),
                ConfigOptionValue(value = "level_2", name = "Level 2"),
                ConfigOptionValue(value = "level_3", name = "Level 3"),
                ConfigOptionValue(value = "level_4", name = "Level 4"),
                ConfigOptionValue(value = "level_5", name = "Level 5"),
            ),
        )
        setRow(ComposerConfigUi(thinking = fiveOptions))

        for (i in 0 until 5) {
            composeTestRule.onNodeWithTag("composer_config_thinking_bar_$i", useUnmergedTree = true).assertExists()
        }
        composeTestRule.onAllNodesWithTag("composer_config_thinking_bar_5", useUnmergedTree = true).assertCountEquals(0)
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
    fun savingLeavesChipsEnabledAndShowsSavingBeam() {
        setRow(
            ComposerConfigUi(
                model = modelOption(),
                mode = modeOption(),
                thinking = thinkingOption(),
                saving = true,
            ),
        )

        composeTestRule.onNodeWithTag("composer_config_model_chip").assertIsEnabled()
        composeTestRule.onNodeWithTag("composer_config_mode_chip").assertIsEnabled()
        composeTestRule.onNodeWithTag("composer_config_thinking_chip").assertIsEnabled()
        composeTestRule.onNodeWithTag("composer_config_saving_beam").assertIsDisplayed()
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
