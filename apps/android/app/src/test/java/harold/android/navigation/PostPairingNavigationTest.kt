package harold.android.navigation

import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Pairing success replaces the stack with Chat. The pairing screen does not
 * stay up, and a cold start with an empty stack shows the splash.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class PostPairingNavigationTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun unknownStartShowsSplash() {
        val navigator = Navigator()

        composeTestRule.setContent {
            NavigationFrame(navigator = navigator) {
                Text(
                    text = "app",
                    modifier = Modifier.testTag("app"),
                )
            }
        }

        composeTestRule.onNodeWithTag("start_splash").assertIsDisplayed()
        assertTrue(
            composeTestRule.onAllNodesWithTag("app").fetchSemanticsNodes().isEmpty(),
        )
    }

    @Test
    fun pairingSuccessShowsChatAndHidesPairing() {
        val navigator = Navigator()
        navigator.chooseStart(Shell)

        composeTestRule.setContent {
            NavDisplay(
                backStack = navigator.backStack,
                onBack = { navigator.goBack() },
                entryDecorators = listOf(
                    rememberSaveableStateHolderNavEntryDecorator(),
                    rememberViewModelStoreNavEntryDecorator(),
                ),
                entryProvider = entryProvider {
                    entry<Shell> {
                        Text(
                            text = "shell",
                            modifier = Modifier.testTag("route_shell"),
                        )
                        Button(
                            onClick = { navigator.openPairing() },
                            modifier = Modifier.testTag("go_pair_button"),
                        ) {
                            Text("go-pair")
                        }
                    }
                    entry<Pairing> {
                        Text(
                            text = "pairing",
                            modifier = Modifier.testTag("route_pairing"),
                        )
                        Button(
                            onClick = { navigator.showChat() },
                            modifier = Modifier.testTag("finish_pair"),
                        ) {
                            Text("finish-pair")
                        }
                    }
                    entry<Chat> {
                        Text(
                            text = "chat",
                            modifier = Modifier.testTag("route_chat"),
                        )
                    }
                },
            )
        }

        composeTestRule.onNodeWithTag("route_shell").assertIsDisplayed()
        composeTestRule.onNodeWithTag("go_pair_button").performClick()
        composeTestRule.onNodeWithTag("route_pairing").assertIsDisplayed()
        composeTestRule.onNodeWithTag("finish_pair").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithTag("route_chat").assertIsDisplayed()
        assertTrue(
            composeTestRule.onAllNodesWithTag("route_pairing").fetchSemanticsNodes().isEmpty(),
        )
        assertTrue(
            composeTestRule.onAllNodesWithTag("route_shell").fetchSemanticsNodes().isEmpty(),
        )
    }
}
