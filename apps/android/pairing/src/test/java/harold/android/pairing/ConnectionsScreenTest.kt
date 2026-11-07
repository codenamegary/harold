package harold.android.pairing

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import harold.android.ui.theme.HaroldTheme
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
}
