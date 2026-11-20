package harold.android.ui.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.test.junit4.v2.createComposeRule
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class HaroldThemeTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun darkThemeUsesLimePrimary() {
        var primary: Color? = null

        composeTestRule.setContent {
            HaroldTheme(darkTheme = true, dynamicColor = false) {
                CapturePrimary { primary = it }
            }
        }

        assertEquals(Lime, primary)
    }

    @Test
    fun lightThemeUsesAccessiblePrimary() {
        var scheme: ColorScheme? = null

        composeTestRule.setContent {
            HaroldTheme(darkTheme = false, dynamicColor = false) {
                scheme = MaterialTheme.colorScheme
            }
        }

        val light = requireNotNull(scheme)
        assertNotEquals(Lime, light.primary)
        assertContrastAtLeast(light.primary, light.surface, 4.5, "primary on surface")
        assertContrastAtLeast(light.primary, light.background, 4.5, "primary on background")
    }

    @Test
    fun lightThemeAccentsMeetTextContrastOnSurfaceAndBackground() {
        var scheme: ColorScheme? = null

        composeTestRule.setContent {
            HaroldTheme(darkTheme = false, dynamicColor = false) {
                scheme = MaterialTheme.colorScheme
            }
        }

        val light = requireNotNull(scheme)
        for (surface in listOf(light.surface, light.background)) {
            assertContrastAtLeast(light.secondary, surface, 4.5, "secondary on $surface")
            assertContrastAtLeast(light.tertiary, surface, 4.5, "tertiary on $surface")
            assertContrastAtLeast(light.error, surface, 4.5, "error on $surface")
        }
    }

    @Test
    fun lightThemeAccentForegroundsMeetContrastOnTheirContainers() {
        var scheme: ColorScheme? = null

        composeTestRule.setContent {
            HaroldTheme(darkTheme = false, dynamicColor = false) {
                scheme = MaterialTheme.colorScheme
            }
        }

        val light = requireNotNull(scheme)
        assertContrastAtLeast(light.onPrimary, light.primary, 4.5, "onPrimary on primary")
        assertContrastAtLeast(light.onSecondary, light.secondary, 4.5, "onSecondary on secondary")
        assertContrastAtLeast(light.onTertiary, light.tertiary, 4.5, "onTertiary on tertiary")
        assertContrastAtLeast(light.onError, light.error, 4.5, "onError on error")
        assertContrastAtLeast(LimeInk, Lime, 4.5, "LimeInk on the brand Lime CTA")
        assertContrastAtLeast(
            light.onPrimaryContainer,
            light.primaryContainer,
            4.5,
            "onPrimaryContainer on primaryContainer",
        )
        assertContrastAtLeast(
            light.onSecondaryContainer,
            light.secondaryContainer,
            4.5,
            "onSecondaryContainer on secondaryContainer",
        )
        assertContrastAtLeast(
            light.onTertiaryContainer,
            light.tertiaryContainer,
            4.5,
            "onTertiaryContainer on tertiaryContainer",
        )
        assertContrastAtLeast(
            light.onErrorContainer,
            light.errorContainer,
            4.5,
            "onErrorContainer on errorContainer",
        )
    }

    @Test
    fun lightThemeOutlineMeetsUiContrast() {
        var scheme: ColorScheme? = null

        composeTestRule.setContent {
            HaroldTheme(darkTheme = false, dynamicColor = false) {
                scheme = MaterialTheme.colorScheme
            }
        }

        val light = requireNotNull(scheme)
        assertContrastAtLeast(light.outline, light.surface, 3.0, "outline on surface")
    }

    @Test
    fun darkThemeAccentsMeetTextContrast() {
        var scheme: ColorScheme? = null

        composeTestRule.setContent {
            HaroldTheme(darkTheme = true, dynamicColor = false) {
                scheme = MaterialTheme.colorScheme
            }
        }

        val dark = requireNotNull(scheme)
        for (surface in listOf(dark.surface, dark.background)) {
            assertContrastAtLeast(dark.primary, surface, 4.5, "primary on $surface")
            assertContrastAtLeast(dark.secondary, surface, 4.5, "secondary on $surface")
            assertContrastAtLeast(dark.tertiary, surface, 4.5, "tertiary on $surface")
            assertContrastAtLeast(dark.error, surface, 4.5, "error on $surface")
        }
    }

    @Test
    fun darkTurnPanelsUsePanel2() {
        var panel: Color? = null

        composeTestRule.setContent {
            HaroldTheme(darkTheme = true, dynamicColor = false) {
                panel = MaterialTheme.colorScheme.surfaceContainer
            }
        }

        assertEquals(Panel2, panel)
    }

    @Test
    fun lightTurnPanelsUseTheLightPanelFill() {
        var panel: Color? = null

        composeTestRule.setContent {
            HaroldTheme(darkTheme = false, dynamicColor = false) {
                panel = MaterialTheme.colorScheme.surfaceContainer
            }
        }

        assertEquals(LightPanel2, panel)
    }
}

private fun assertContrastAtLeast(
    foreground: Color,
    background: Color,
    minimum: Double,
    label: String,
) {
    val lighter = maxOf(foreground.luminance(), background.luminance())
    val darker = minOf(foreground.luminance(), background.luminance())
    val ratio = (lighter + 0.05) / (darker + 0.05)
    assertTrue(
        "$label contrast was ${"%.2f".format(ratio)}:1, expected at least $minimum:1",
        ratio >= minimum,
    )
}

@Composable
private fun CapturePrimary(onPrimary: (Color) -> Unit) {
    onPrimary(MaterialTheme.colorScheme.primary)
}
