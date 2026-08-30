package server.agent.android.chat

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import server.agent.android.contracts.AvailableCommand
import server.agent.android.ui.theme.AgentServerTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class VoiceDictationOverlayTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Composable
    private fun Overlay(
        state: VoiceDictationUiState,
        commandPrefix: String = "",
        commands: List<AvailableCommand> = emptyList(),
        commandListVisible: Boolean = false,
        onToggleListening: () -> Unit = {},
        onStartOver: () -> Unit = {},
        onCancel: () -> Unit = {},
        onCollapse: () -> Unit = {},
        onKeyboard: () -> Unit = {},
        onSend: () -> Unit = {},
        onCommandToggle: () -> Unit = {},
        onCommandPick: (String) -> Unit = {},
        onCommandDismiss: () -> Unit = {},
        onRequestPermission: () -> Unit = {},
        onOpenPermissionSettings: () -> Unit = {},
    ) {
        VoiceDictationOverlay(
            state = state,
            commandPrefix = commandPrefix,
            commands = commands,
            commandListVisible = commandListVisible,
            onToggleListening = onToggleListening,
            onStartOver = onStartOver,
            onCancel = onCancel,
            onCollapse = onCollapse,
            onKeyboard = onKeyboard,
            onSend = onSend,
            onCommandToggle = onCommandToggle,
            onCommandPick = onCommandPick,
            onCommandDismiss = onCommandDismiss,
            onRequestPermission = onRequestPermission,
            onOpenPermissionSettings = onOpenPermissionSettings,
        )
    }

    private fun expandedState(
        transcript: String = "",
        isListening: Boolean = false,
        permissionRequired: Boolean = false,
    ) = VoiceDictationUiState(
        visible = true,
        presentation = VoiceDictationPresentation.Expanded,
        transcript = transcript,
        isListening = isListening,
        permissionRequired = permissionRequired,
    )

    @Test
    fun doesNotRenderWhenVisibleIsFalse() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                Overlay(state = VoiceDictationUiState(visible = false))
            }
        }

        composeTestRule.onAllNodesWithTag("voice_dictation_overlay").assertCountEquals(0)
    }

    @Test
    fun doesNotRenderInlinePresentation() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                Overlay(
                    state = VoiceDictationUiState(
                        visible = true,
                        presentation = VoiceDictationPresentation.Inline,
                        transcript = "Inline dictation",
                    ),
                )
            }
        }

        composeTestRule.onAllNodesWithTag("voice_dictation_overlay").assertCountEquals(0)
    }

    @Test
    fun showsPlaceholderWhenTranscriptIsEmpty() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                Overlay(state = expandedState(transcript = "", isListening = true))
            }
        }

        composeTestRule.onNodeWithTag("voice_dictation_overlay").assertIsDisplayed()
        composeTestRule.onNodeWithTag("voice_dictation_placeholder").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("voice_dictation_transcript").assertCountEquals(0)
    }

    @Test
    fun showsTranscriptWithCommandPrefix() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                Overlay(
                    state = expandedState(
                        transcript = "refactor connection pooling",
                        isListening = true,
                    ),
                    commandPrefix = "/plan ",
                )
            }
        }

        composeTestRule.onNodeWithTag("voice_dictation_transcript").assertIsDisplayed()
        composeTestRule.onNodeWithText("/plan refactor connection pooling").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("voice_dictation_placeholder").assertCountEquals(0)
    }

    @Test
    fun hidesSecondaryControlsWhileActivelyListening() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                Overlay(
                    state = expandedState(
                        transcript = "Speaking right now",
                        isListening = true,
                    ),
                )
            }
        }

        composeTestRule.onNodeWithTag("voice_dictation_mic_toggle").assertIsDisplayed()
        composeTestRule.onNodeWithTag("voice_dictation_send").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("voice_dictation_start_over").assertCountEquals(0)
        composeTestRule.onAllNodesWithTag("voice_dictation_cancel").assertCountEquals(0)
    }

    @Test
    fun revealsSecondaryControlsWhenPausedAndTriggersCallbacks() {
        var startOverCalled = false
        var cancelCalled = false
        var toggleCalled = false
        var sendCalled = false
        var collapseCalled = false
        var keyboardCalled = false

        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                Overlay(
                    state = expandedState(
                        transcript = "Paused dictation",
                        isListening = false,
                    ),
                    onToggleListening = { toggleCalled = true },
                    onStartOver = { startOverCalled = true },
                    onCancel = { cancelCalled = true },
                    onCollapse = { collapseCalled = true },
                    onKeyboard = { keyboardCalled = true },
                    onSend = { sendCalled = true },
                )
            }
        }

        composeTestRule.onNodeWithTag("voice_dictation_start_over")
            .assertIsDisplayed()
            .performClick()
        assertTrue(startOverCalled)

        composeTestRule.onNodeWithTag("voice_dictation_cancel")
            .assertIsDisplayed()
            .performClick()
        assertTrue(cancelCalled)

        composeTestRule.onNodeWithTag("voice_dictation_mic_toggle")
            .assertIsDisplayed()
            .performClick()
        assertTrue(toggleCalled)

        composeTestRule.onNodeWithTag("voice_dictation_send")
            .assertIsDisplayed()
            .performClick()
        assertTrue(sendCalled)

        composeTestRule.onNodeWithTag("voice_dictation_collapse")
            .assertIsDisplayed()
            .performClick()
        assertTrue(collapseCalled)

        composeTestRule.onNodeWithTag("voice_dictation_keyboard")
            .assertIsDisplayed()
            .performClick()
        assertTrue(keyboardCalled)
    }

    @Test
    fun commandListTakesOverTranscriptAndPicks() {
        var picked: String? = null

        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                Overlay(
                    state = expandedState(transcript = "Dictated words"),
                    commands = listOf(
                        AvailableCommand(name = "plan", description = "Draft a plan"),
                        AvailableCommand(name = "review", description = "Review changes"),
                    ),
                    commandListVisible = true,
                    onCommandPick = { name -> picked = name },
                )
            }
        }

        composeTestRule.onNodeWithTag("command_list_panel").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("voice_dictation_transcript").assertCountEquals(0)
        composeTestRule.onNodeWithTag("command_list_item_plan")
            .assertIsDisplayed()
            .performClick()
        assertTrue(picked == "plan")
    }

    @Test
    fun showsPermissionRequiredUiAndTriggersPermissionCallbacks() {
        var grantCalled = false
        var settingsCalled = false
        var cancelCalled = false

        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                Overlay(
                    state = expandedState(permissionRequired = true),
                    onCancel = { cancelCalled = true },
                    onRequestPermission = { grantCalled = true },
                    onOpenPermissionSettings = { settingsCalled = true },
                )
            }
        }

        composeTestRule.onNodeWithTag("voice_dictation_permission_body").assertIsDisplayed()
        composeTestRule.onNodeWithTag("voice_dictation_permission_grant")
            .assertIsDisplayed()
            .performClick()
        assertTrue(grantCalled)

        composeTestRule.onNodeWithTag("voice_dictation_permission_settings")
            .assertIsDisplayed()
            .performClick()
        assertTrue(settingsCalled)

        composeTestRule.onNodeWithTag("voice_dictation_cancel")
            .assertIsDisplayed()
            .performClick()
        assertTrue(cancelCalled)
    }
}
