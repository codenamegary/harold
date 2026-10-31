package harold.android.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.v2.createComposeRule
import org.junit.Assert.assertEquals
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
    fun lightThemeUsesLimePrimary() {
        var primary: Color? = null

        composeTestRule.setContent {
            HaroldTheme(darkTheme = false, dynamicColor = false) {
                CapturePrimary { primary = it }
            }
        }

        assertEquals(Lime, primary)
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

@Composable
private fun CapturePrimary(onPrimary: (Color) -> Unit) {
    onPrimary(MaterialTheme.colorScheme.primary)
}
