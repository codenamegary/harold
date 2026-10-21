package harold.android.pairing

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import harold.android.navigation.Chat
import harold.android.navigation.Navigator

@OptIn(ExperimentalCoroutinesApi::class)
class PairingViewModelTest {
    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun onQrScannedClaimsThroughTheParserSeamWithoutACamera() = runTest {
        val coordinator = FakePairingCoordinator(Result.success(Unit))
        val viewModel = PairingViewModel(
            pairingCoordinator = coordinator,
            payloadParser = DefaultPairingPayloadParser(),
            deviceNameProvider = { "Pixel Test" },
            navigator = Navigator(),
        )

        viewModel.onQrScanned(
            "harold://pair?v=1&endpoint=http%3A%2F%2F10.0.2.2%3A3847&code=R7K-4MP",
        )
        assertTrue(coordinator.calls.isEmpty())
        assertEquals(PairingPhase.Confirm, viewModel.uiState.value.phase)
        viewModel.onNameChanged("desk")
        viewModel.confirmPairing()

        assertEquals(
            listOf(
                FakePairingCoordinator.Call(
                    endpoint = "http://10.0.2.2:3847",
                    code = "R7K-4MP",
                    deviceName = "Pixel Test",
                    appearance = HaroldAppearance(
                        name = "desk",
                        colorId = haroldColorIds.first(),
                        iconId = haroldIconIds.first(),
                    ),
                ),
            ),
            coordinator.calls,
        )
        assertTrue(viewModel.uiState.value.completed)
        assertTrue(viewModel.uiState.value.isClaiming)
    }

    @Test
    fun claimSuccessStaysClaimingAndOpensChat() = runTest {
        val navigator = Navigator()
        navigator.start(paired = false)
        navigator.openPairing()
        val coordinator = FakePairingCoordinator(Result.success(Unit))
        val viewModel = PairingViewModel(
            pairingCoordinator = coordinator,
            payloadParser = DefaultPairingPayloadParser(),
            deviceNameProvider = { "Pixel Test" },
            navigator = navigator,
        )

        val payload = "harold://pair?v=1&endpoint=http%3A%2F%2F10.0.2.2%3A3847&code=R7K-4MP"
        viewModel.onQrScanned(payload)
        viewModel.onQrScanned(payload)
        viewModel.confirmPairing()

        assertEquals(1, coordinator.calls.size)
        assertTrue(viewModel.uiState.value.completed)
        assertTrue(viewModel.uiState.value.isClaiming)
        assertEquals(listOf(Chat), navigator.backStack.toList())
    }

    @Test
    fun onQrScannedSurfacesParserErrorsWithoutClaiming() = runTest {
        val coordinator = FakePairingCoordinator(Result.success(Unit))
        val viewModel = PairingViewModel(
            pairingCoordinator = coordinator,
            payloadParser = DefaultPairingPayloadParser(),
            deviceNameProvider = { "Pixel Test" },
            navigator = Navigator(),
        )

        viewModel.onQrScanned("not-a-pairing-uri")

        assertTrue(coordinator.calls.isEmpty())
        assertEquals("Invalid pairing URI scheme", viewModel.uiState.value.errorMessage)
        assertFalse(viewModel.uiState.value.completed)
    }

    @Test
    fun onQrScannedSurfacesRetiredAgentServerSchemeAsInvalidScheme() = runTest {
        val coordinator = FakePairingCoordinator(Result.success(Unit))
        val viewModel = PairingViewModel(
            pairingCoordinator = coordinator,
            payloadParser = DefaultPairingPayloadParser(),
            deviceNameProvider = { "Pixel Test" },
            navigator = Navigator(),
        )

        viewModel.onQrScanned("agent-server://pair?v=1&endpoint=http%3A%2F%2F10.0.2.2%3A3847&code=R7K-4MP")

        assertTrue(coordinator.calls.isEmpty())
        assertEquals(
            "Invalid pairing URI scheme",
            viewModel.uiState.value.errorMessage,
        )
        assertFalse(viewModel.uiState.value.completed)
    }

    @Test
    fun consumesDeepLinkFromPairingRequestsAndClaimsAutomatically() = runTest {
        val coordinator = FakePairingCoordinator(Result.success(Unit))
        val requests = DefaultPairingRequests()
        requests.requestPairing("harold://pair?v=1&endpoint=http%3A%2F%2F10.0.2.2%3A3847&code=R7K-4MP")

        val viewModel = PairingViewModel(
            pairingCoordinator = coordinator,
            payloadParser = DefaultPairingPayloadParser(),
            deviceNameProvider = { "Pixel Test" },
            navigator = Navigator(),
            pairingRequests = requests,
        )
        assertTrue(coordinator.calls.isEmpty())
        viewModel.confirmPairing()

        assertEquals(
            listOf(
                FakePairingCoordinator.Call(
                    endpoint = "http://10.0.2.2:3847",
                    code = "R7K-4MP",
                    deviceName = "Pixel Test",
                    appearance = HaroldAppearance(
                        name = "laptop",
                        colorId = haroldColorIds.first(),
                        iconId = haroldIconIds.first(),
                    ),
                ),
            ),
            coordinator.calls,
        )
        assertTrue(viewModel.uiState.value.completed)
        org.junit.Assert.assertNull(requests.pendingUri.value)
    }

    @Test
    fun submitManualPairingUsesTheSameParserSeam() = runTest {
        val coordinator = FakePairingCoordinator(Result.success(Unit))
        val viewModel = PairingViewModel(
            pairingCoordinator = coordinator,
            payloadParser = DefaultPairingPayloadParser(),
            deviceNameProvider = { "Pixel Test" },
            navigator = Navigator(),
        )

        viewModel.showManualEntry()
        viewModel.onEndpointChanged("http://10.0.2.2:3847")
        viewModel.onCodeChanged("r7k-4mp")
        viewModel.submitManualPairing()
        viewModel.confirmPairing()

        assertEquals(
            listOf(
                FakePairingCoordinator.Call(
                    endpoint = "http://10.0.2.2:3847",
                    code = "R7K-4MP",
                    deviceName = "Pixel Test",
                    appearance = HaroldAppearance(
                        name = "laptop",
                        colorId = haroldColorIds.first(),
                        iconId = haroldIconIds.first(),
                    ),
                ),
            ),
            coordinator.calls,
        )
        assertTrue(viewModel.uiState.value.completed)
    }

    @Test
    fun theSameAddressAsksBeforeTheCodeIsClaimed() = runTest {
        val coordinator = FakePairingCoordinator(
            result = Result.success(Unit),
            draft = PairingDraft(
                serverOrigin = "http://10.0.2.2:3847",
                alreadySaved = true,
                appearance = HaroldAppearance(name = "work", colorId = "tide", iconId = "home"),
            ),
        )
        val viewModel = PairingViewModel(
            pairingCoordinator = coordinator,
            payloadParser = DefaultPairingPayloadParser(),
            deviceNameProvider = { "Pixel Test" },
            navigator = Navigator(),
        )

        viewModel.onQrScanned(
            "harold://pair?v=1&endpoint=http%3A%2F%2F10.0.2.2%3A3847&code=R7K-4MP",
        )

        assertTrue(coordinator.calls.isEmpty())
        assertEquals(PairingPhase.AlreadySaved, viewModel.uiState.value.phase)
        assertEquals("work", viewModel.uiState.value.name)
        viewModel.cancelUpdate()
        assertTrue(coordinator.calls.isEmpty())
        assertEquals(PairingPhase.Capture, viewModel.uiState.value.phase)
    }

    @Test
    fun updateKeepsTheSavedIdentityUntilTheUserEditsIt() = runTest {
        val coordinator = FakePairingCoordinator(
            result = Result.success(Unit),
            draft = PairingDraft(
                serverOrigin = "http://10.0.2.2:3847",
                alreadySaved = true,
                appearance = HaroldAppearance(name = "work", colorId = "tide", iconId = "home"),
            ),
        )
        val viewModel = PairingViewModel(
            pairingCoordinator = coordinator,
            payloadParser = DefaultPairingPayloadParser(),
            deviceNameProvider = { "Pixel Test" },
            navigator = Navigator(),
        )

        viewModel.onQrScanned(
            "harold://pair?v=1&endpoint=http%3A%2F%2F10.0.2.2%3A3847&code=R7K-4MP",
        )
        viewModel.confirmUpdate()
        assertEquals(PairingPhase.Confirm, viewModel.uiState.value.phase)
        assertEquals("work", viewModel.uiState.value.name)
        viewModel.onNameChanged("office")
        viewModel.onColorSelected("leaf")
        viewModel.confirmPairing()

        assertEquals(
            HaroldAppearance(name = "office", colorId = "leaf", iconId = "home"),
            coordinator.calls.single().appearance,
        )
    }
}

private class FakePairingCoordinator(
    private val result: Result<Unit>,
    private val draft: PairingDraft = PairingDraft(
        serverOrigin = "http://10.0.2.2:3847",
        alreadySaved = false,
        appearance = HaroldAppearance(
            name = "laptop",
            colorId = haroldColorIds.first(),
            iconId = haroldIconIds.first(),
        ),
    ),
) : PairingCoordinator {
    data class Call(
        val endpoint: String,
        val code: String,
        val deviceName: String,
        val appearance: HaroldAppearance,
    )

    val calls = mutableListOf<Call>()

    override suspend fun draft(endpoint: String): PairingDraft = draft

    override suspend fun pair(
        endpoint: String,
        code: String,
        deviceName: String,
        appearance: HaroldAppearance,
    ): Result<Unit> {
        calls += Call(
            endpoint = endpoint,
            code = code,
            deviceName = deviceName,
            appearance = appearance,
        )
        return result
    }
}
