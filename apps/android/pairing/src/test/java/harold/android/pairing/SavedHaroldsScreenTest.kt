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
class SavedHaroldsScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsEachHaroldNameOriginAndBadge() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SavedHaroldsScreen(
                    uiState = SavedHaroldsUiState(
                        rows = listOf(
                            SavedHaroldRow(
                                serverOrigin = "http://laptop.local:3847",
                                deviceId = "device_laptop",
                                name = "laptop",
                                colorId = "tide",
                                iconId = "bolt",
                            ),
                        ),
                    ),
                    onBack = {},
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

        composeTestRule.onNodeWithText("Connected Servers").assertIsDisplayed()
        composeTestRule.onNodeWithText("laptop").assertIsDisplayed()
        composeTestRule.onNodeWithText("http://laptop.local:3847").assertIsDisplayed()
        composeTestRule.onNodeWithTag("saved_harold_badge_http://laptop.local:3847").assertIsDisplayed()
        composeTestRule.onNodeWithTag("saved_harold_edit_http://laptop.local:3847").assertIsDisplayed()
        composeTestRule.onNodeWithTag("saved_harold_remove_http://laptop.local:3847").assertIsDisplayed()
    }
}
