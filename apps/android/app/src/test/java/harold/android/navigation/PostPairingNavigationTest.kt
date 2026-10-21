package harold.android.navigation

import androidx.compose.material3.Text
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import harold.android.pairing.DefaultPairingPayloadParser
import harold.android.pairing.HaroldAppearance
import harold.android.pairing.PairingCoordinator
import harold.android.pairing.PairingDraft
import harold.android.pairing.PairingScreen
import harold.android.pairing.haroldColorIds
import harold.android.pairing.haroldIconIds
import harold.android.pairing.PairingUiState
import harold.android.pairing.PairingViewModel
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Pairing success replaces the stack with Chat. The pairing screen never
 * renders its enabled form again once the claim starts, and a cold start with
 * an empty stack shows the splash.
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
    fun pairingSuccessShowsChatWithoutReEnablingPairing() {
        val navigator = Navigator()
        navigator.start(paired = false)
        navigator.openPairing()
        val claim = CompletableDeferred<Result<Unit>>()
        val viewModel = PairingViewModel(
            pairingCoordinator = GatedPairingCoordinator(claim),
            payloadParser = DefaultPairingPayloadParser(),
            deviceNameProvider = { "Pixel Test" },
            navigator = navigator,
        )
        val rendered = mutableListOf<PairingUiState>()

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
                    }
                    entry<Pairing> {
                        val uiState by viewModel.uiState.collectAsStateWithLifecycle()
                        SideEffect { rendered += uiState }
                        PairingScreen(
                            uiState = uiState,
                            onManualEntryClick = viewModel::showManualEntry,
                            onScannerClick = viewModel::showScanner,
                            onEndpointChanged = viewModel::onEndpointChanged,
                            onCodeChanged = viewModel::onCodeChanged,
                            onSubmitManual = viewModel::submitManualPairing,
                            onQrScanned = viewModel::onQrScanned,
                            onBack = { navigator.goBack() },
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

        composeTestRule.onNodeWithTag("pairing_back").assertIsDisplayed()
        composeTestRule.runOnIdle { viewModel.onQrScanned(PAYLOAD) }
        composeTestRule.waitForIdle()
        composeTestRule.runOnIdle { viewModel.confirmPairing() }
        composeTestRule.waitForIdle()
        composeTestRule.runOnIdle { claim.complete(Result.success(Unit)) }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithTag("route_chat").assertIsDisplayed()
        assertTrue(
            composeTestRule.onAllNodesWithTag("pairing_back").fetchSemanticsNodes().isEmpty(),
        )
        assertTrue(
            composeTestRule.onAllNodesWithTag("route_shell").fetchSemanticsNodes().isEmpty(),
        )
        val sinceClaim = rendered.dropWhile { state -> !state.isClaiming }
        assertTrue(sinceClaim.isNotEmpty())
        assertTrue(sinceClaim.all { state -> state.isClaiming })
    }

    private class GatedPairingCoordinator(
        private val result: CompletableDeferred<Result<Unit>>,
    ) : PairingCoordinator {
        override suspend fun draft(endpoint: String): PairingDraft = PairingDraft(
            serverOrigin = endpoint,
            alreadySaved = false,
            appearance = HaroldAppearance(
                name = "laptop",
                colorId = haroldColorIds.first(),
                iconId = haroldIconIds.first(),
            ),
        )

        override suspend fun pair(
            endpoint: String,
            code: String,
            deviceName: String,
            appearance: HaroldAppearance,
        ): Result<Unit> = result.await()
    }

    private companion object {
        const val PAYLOAD = "harold://pair?v=1&endpoint=http%3A%2F%2F10.0.2.2%3A3847&code=R7K-4MP"
    }
}
