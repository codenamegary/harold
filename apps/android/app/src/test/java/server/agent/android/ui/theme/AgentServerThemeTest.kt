package server.agent.android.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class AgentServerThemeTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun darkThemeUsesLimePrimary() {
        var primary: Color? = null

        composeTestRule.setContent {
            AgentServerTheme(darkTheme = true, dynamicColor = false) {
                CapturePrimary { primary = it }
            }
        }

        assertEquals(Lime, primary)
    }

    @Test
    fun lightThemeUsesLimePrimary() {
        var primary: Color? = null

        composeTestRule.setContent {
            AgentServerTheme(darkTheme = false, dynamicColor = false) {
                CapturePrimary { primary = it }
            }
        }

        assertEquals(Lime, primary)
    }
}

@Composable
private fun CapturePrimary(onPrimary: (Color) -> Unit) {
    onPrimary(MaterialTheme.colorScheme.primary)
}
