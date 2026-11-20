package harold.android.chat.composer

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.test.junit4.v2.createComposeRule
import harold.android.ui.theme.HaroldTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class ModeColorsThemeTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun lightModeColorsMeetTextContrastOnTheComposerSurface() {
        var surface: Color? = null
        var captured: List<Pair<String, Color>> = emptyList()

        composeTestRule.setContent {
            HaroldTheme(darkTheme = false, dynamicColor = false) {
                val composerSurface = MaterialTheme.colorScheme.surface
                val colors = listOf(
                    "agent" to modeColorOf("agent"),
                    "build" to modeColorOf("build"),
                    "ask" to modeColorOf("ask"),
                    "plan" to modeColorOf("plan"),
                    "edit" to modeColorOf("edit"),
                )
                SideEffect {
                    surface = composerSurface
                    captured = colors.mapNotNull { (name, color) ->
                        color?.let { name to it }
                    }
                }
            }
        }

        composeTestRule.waitForIdle()
        val background = requireNotNull(surface)
        assertTrue("expected mode colors", captured.isNotEmpty())
        captured.forEach { (name, color) ->
            assertContrastAtLeast(color, background, name)
        }
    }

    private fun assertContrastAtLeast(foreground: Color, background: Color, label: String) {
        val lighter = maxOf(foreground.luminance(), background.luminance())
        val darker = minOf(foreground.luminance(), background.luminance())
        val ratio = (lighter + 0.05) / (darker + 0.05)
        assertTrue(
            "$label mode color contrast was ${"%.2f".format(ratio)}:1, expected at least 4.5:1",
            ratio >= 4.5,
        )
    }
}
