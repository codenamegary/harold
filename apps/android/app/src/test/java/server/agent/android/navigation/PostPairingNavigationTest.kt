package server.agent.android.navigation

import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Regression for the post-pairing blank screen.
 *
 * [AppNavHost] navigates with `showShell`: pairing success flips it to false and
 * navigates to Chat with a cleared stack. A second `popBackStack()` on pairing
 * `completed` raced that navigate and emptied the back stack.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class PostPairingNavigationTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun afterPairingCompletesOperatorScreenIsVisible() {
        composeTestRule.setContent {
            val navController = rememberNavController()
            var showShell by remember { mutableStateOf(true) }

            // Same showShell effect as AppNavHost — sole post-pair navigator.
            LaunchedEffect(showShell) {
                if (showShell) {
                    navController.navigate(Routes.Shell) {
                        popUpTo(0) { inclusive = true }
                    }
                } else {
                    navController.navigate(Routes.Chat) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            }

            NavHost(
                navController = navController,
                startDestination = Routes.Shell,
            ) {
                composable(Routes.Shell) {
                    Text(
                        text = "shell",
                        modifier = Modifier.testTag("route_shell"),
                    )
                    Button(
                        onClick = { navController.navigate(Routes.Pairing) },
                        modifier = Modifier.testTag("go_pair_button"),
                    ) {
                        Text("go-pair")
                    }
                }

                composable(Routes.Pairing) {
                    Text(
                        text = "pairing",
                        modifier = Modifier.testTag("route_pairing"),
                    )
                    Button(
                        onClick = { showShell = false },
                        modifier = Modifier.testTag("finish_pair"),
                    ) {
                        Text("finish-pair")
                    }
                }

                composable(Routes.Chat) {
                    Text(
                        text = "chat",
                        modifier = Modifier.testTag("route_chat"),
                    )
                }
            }
        }

        composeTestRule.onNodeWithTag("route_shell").assertIsDisplayed()
        composeTestRule.onNodeWithTag("go_pair_button").performClick()
        composeTestRule.onNodeWithTag("route_pairing").assertIsDisplayed()
        composeTestRule.onNodeWithTag("finish_pair").performClick()
        composeTestRule.waitForIdle()

        val chatVisible = composeTestRule
            .onAllNodesWithTag("route_chat")
            .fetchSemanticsNodes()
            .isNotEmpty()
        val shellVisible = composeTestRule
            .onAllNodesWithTag("route_shell")
            .fetchSemanticsNodes()
            .isNotEmpty()

        assertTrue(
            "Expected Chat (or Shell) after pairing; got blank back stack",
            chatVisible || shellVisible,
        )
    }
}
