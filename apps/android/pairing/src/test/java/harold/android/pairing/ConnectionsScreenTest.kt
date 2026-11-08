package harold.android.pairing

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import harold.android.ui.theme.HaroldTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class ConnectionsScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsEachConnectionNameOriginAndBadge() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ConnectionsScreen(
                    uiState = ConnectionsUiState(
                        rows = listOf(
                            ConnectionRow(
                                connectionId = "ssh://gary@laptop.local:22",
                                name = "laptop",
                                colorId = "tide",
                                iconId = "bolt",
                            ),
                        ),
                    ),
                    onBack = {},
                    onAdd = {},
                    onEdit = {},
                    onRemove = {},
                    onNameChanged = {},
                    onColorSelected = {},
                    onIconSelected = {},
                    onSave = {},
                    onCancelEdit = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Connections").assertIsDisplayed()
        composeTestRule.onNodeWithText("laptop").assertIsDisplayed()
        composeTestRule.onNodeWithText("ssh://gary@laptop.local:22").assertIsDisplayed()
        composeTestRule.onNodeWithTag("connection_badge_ssh://gary@laptop.local:22").assertIsDisplayed()
        composeTestRule.onNodeWithTag("connection_agents_ssh://gary@laptop.local:22").assertIsDisplayed()
        composeTestRule.onNodeWithTag("connection_settings_ssh://gary@laptop.local:22").assertIsDisplayed()
        composeTestRule.onNodeWithTag("connection_remove_ssh://gary@laptop.local:22").assertIsDisplayed()
    }

    @Test
    fun addConnectionFabOpensSshSetup() {
        var addClicks = 0
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ConnectionsScreen(
                    uiState = ConnectionsUiState(),
                    onBack = {},
                    onAdd = { addClicks++ },
                    onEdit = {},
                    onRemove = {},
                    onNameChanged = {},
                    onColorSelected = {},
                    onIconSelected = {},
                    onSave = {},
                    onCancelEdit = {},
                )
            }
        }

        composeTestRule
            .onNodeWithTag("connections_add")
            .assertIsDisplayed()
            .performClick()
        assertEquals(1, addClicks)
    }
}
