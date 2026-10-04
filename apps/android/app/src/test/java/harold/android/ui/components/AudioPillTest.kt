package harold.android.ui.components

import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import harold.android.ui.theme.HaroldTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class AudioPillTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun audioPillDisplaysAndHandlesClicks() {
        var pillClicked = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                AudioPill(
                    isListening = true,
                    audioLevel = 0.5f,
                    onClick = { pillClicked = true },
                    contentDescription = "Mute mic",
                    modifier = Modifier.testTag("test_audio_pill"),
                )
            }
        }

        composeTestRule.onNodeWithTag("test_audio_pill")
            .assertIsDisplayed()
            .assertHasClickAction()
            .performClick()

        assertTrue(pillClicked)
        composeTestRule.onNodeWithTag("audio_pill_icon", useUnmergedTree = true).assertIsDisplayed()
        composeTestRule.onNodeWithTag("audio_pill_bars", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun audioPillDisplaysPausedStateWhenNotListening() {
        var pillClicked = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                AudioPill(
                    isListening = false,
                    audioLevel = 0f,
                    onClick = { pillClicked = true },
                    contentDescription = "Unmute mic",
                    modifier = Modifier.testTag("paused_audio_pill"),
                )
            }
        }

        composeTestRule.onNodeWithTag("paused_audio_pill")
            .assertIsDisplayed()
            .performClick()

        assertTrue(pillClicked)
    }

    @Test
    fun audioPillShowsSilenceCountdownRingWhenActive() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                AudioPill(
                    isListening = true,
                    audioLevel = 0.2f,
                    silenceCountdownDurationMs = 5_000L,
                    onClick = {},
                    contentDescription = "Mute mic",
                    modifier = Modifier.testTag("countdown_audio_pill"),
                )
            }
        }

        composeTestRule.onNodeWithTag("countdown_audio_pill").assertIsDisplayed()
        composeTestRule
            .onNodeWithTag("audio_pill_silence_ring", useUnmergedTree = true)
            .assertIsDisplayed()
    }

    @Test
    fun audioPillHidesSilenceCountdownRingWhenNoDurationGiven() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                AudioPill(
                    isListening = true,
                    audioLevel = 0.2f,
                    onClick = {},
                    contentDescription = "Mute mic",
                    modifier = Modifier.testTag("plain_audio_pill"),
                )
            }
        }

        composeTestRule
            .onNodeWithTag("audio_pill_silence_ring", useUnmergedTree = true)
            .assertDoesNotExist()
    }

    @Test
    fun silenceCountdownRingDrainsOverTime() {
        composeTestRule.mainClock.autoAdvance = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                AudioPill(
                    isListening = true,
                    audioLevel = 0.2f,
                    silenceCountdownDurationMs = 5_000L,
                    onClick = {},
                    contentDescription = "Mute mic",
                    modifier = Modifier.testTag("draining_audio_pill"),
                )
            }
        }

        composeTestRule.mainClock.advanceTimeBy(1_000)
        val early = ringProgress()

        composeTestRule.mainClock.advanceTimeBy(2_000)
        val later = ringProgress()

        assertTrue("ring should start draining, was $early", early < 1f)
        assertTrue("ring should keep draining, $early then $later", later < early)
    }

    private fun ringProgress(): Float =
        composeTestRule
            .onNodeWithTag("audio_pill_silence_ring", useUnmergedTree = true)
            .fetchSemanticsNode()
            .config[SemanticsProperties.ProgressBarRangeInfo]
            .current
}
