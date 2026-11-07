package harold.android.navigation

import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
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
 * A cold start with an empty stack shows the splash. Once the start route is
 * chosen it replaces the splash and repeated start calls are ignored.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class StartFlowNavigationTest {
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
    fun unpairedStartShowsTheShellAndStaysPut() {
        val navigator = Navigator()

        composeTestRule.setContent {
            NavigationFrame(navigator = navigator) {
                NavDisplay(
                    backStack = navigator.backStack,
                    onBack = { navigator.goBack() },
                    entryDecorators = listOf(
                        rememberSaveableStateHolderNavEntryDecorator(),
                    ),
                    entryProvider = entryProvider {
                        entry<Shell> {
                            Text(
                                text = "shell",
                                modifier = Modifier.testTag("route_shell"),
                            )
                        }
                        entry<SshSetup> {
                            Text(
                                text = "ssh setup",
                                modifier = Modifier.testTag("route_ssh_setup"),
                            )
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
        }

        composeTestRule.runOnIdle { navigator.start(paired = false) }
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("route_shell").assertIsDisplayed()

        composeTestRule.runOnIdle {
            navigator.start(paired = true)
            navigator.openAddConnection()
        }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithTag("route_ssh_setup").assertIsDisplayed()
        assertTrue(
            composeTestRule.onAllNodesWithTag("route_chat").fetchSemanticsNodes().isEmpty(),
        )
    }
}
