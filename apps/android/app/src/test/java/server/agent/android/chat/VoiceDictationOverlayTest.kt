package server.agent.android.chat

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import server.agent.android.ui.theme.AgentServerTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class VoiceDictationOverlayTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun doesNotRenderWhenVisibleIsFalse() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                VoiceDictationOverlay(
                    state = VoiceDictationUiState(visible = false),
                    onToggleListening = {},
                    onStartOver = {},
                    onCancel = {},
                    onConfirm = {},
                    onRequestPermission = {},
                    onOpenPermissionSettings = {},
                )
            }
        }

        composeTestRule.onAllNodesWithTag("voice_dictation_overlay").assertCountEquals(0)
    }

    @Test
    fun showsPlaceholderWhenTranscriptIsEmpty() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                VoiceDictationOverlay(
                    state = VoiceDictationUiState(
                        visible = true,
                        transcript = "",
                        isListening = true,
                    ),
                    onToggleListening = {},
                    onStartOver = {},
                    onCancel = {},
                    onConfirm = {},
                    onRequestPermission = {},
                    onOpenPermissionSettings = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("voice_dictation_overlay").assertIsDisplayed()
        composeTestRule.onNodeWithTag("voice_dictation_placeholder").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("voice_dictation_transcript").assertCountEquals(0)
    }

    @Test
    fun showsTranscriptWhenNonEmpty() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                VoiceDictationOverlay(
                    state = VoiceDictationUiState(
                        visible = true,
                        transcript = "Refactor connection pooling",
                        isListening = true,
                    ),
                    onToggleListening = {},
                    onStartOver = {},
                    onCancel = {},
                    onConfirm = {},
                    onRequestPermission = {},
                    onOpenPermissionSettings = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("voice_dictation_transcript").assertIsDisplayed()
        composeTestRule.onNodeWithText("Refactor connection pooling").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("voice_dictation_placeholder").assertCountEquals(0)
    }

    @Test
    fun hidesSecondaryControlsWhileActivelyListening() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                VoiceDictationOverlay(
                    state = VoiceDictationUiState(
                        visible = true,
                        transcript = "Speaking right now",
                        isListening = true,
                    ),
                    onToggleListening = {},
                    onStartOver = {},
                    onCancel = {},
                    onConfirm = {},
                    onRequestPermission = {},
                    onOpenPermissionSettings = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("voice_dictation_mic_toggle").assertIsDisplayed()
        composeTestRule.onNodeWithTag("voice_dictation_done").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("voice_dictation_start_over").assertCountEquals(0)
        composeTestRule.onAllNodesWithTag("voice_dictation_cancel").assertCountEquals(0)
    }

    @Test
    fun revealsSecondaryControlsWhenPausedAndTriggersCallbacks() {
        var startOverCalled = false
        var cancelCalled = false
        var toggleCalled = false
        var confirmCalled = false

        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                VoiceDictationOverlay(
                    state = VoiceDictationUiState(
                        visible = true,
                        transcript = "Paused dictation",
                        isListening = false,
                    ),
                    onToggleListening = { toggleCalled = true },
                    onStartOver = { startOverCalled = true },
                    onCancel = { cancelCalled = true },
                    onConfirm = { confirmCalled = true },
                    onRequestPermission = {},
                    onOpenPermissionSettings = {},
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

        composeTestRule.onNodeWithTag("voice_dictation_done")
            .assertIsDisplayed()
            .performClick()
        assertTrue(confirmCalled)
    }

    @Test
    fun showsPermissionRequiredUiAndTriggersPermissionCallbacks() {
        var grantCalled = false
        var settingsCalled = false
        var cancelCalled = false

        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                VoiceDictationOverlay(
                    state = VoiceDictationUiState(
                        visible = true,
                        permissionRequired = true,
                        isListening = false,
                    ),
                    onToggleListening = {},
                    onStartOver = {},
                    onCancel = { cancelCalled = true },
                    onConfirm = {},
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
