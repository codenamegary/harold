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
            payloadParser = DefaultPairingPayloadParser(rejectCleartext = false),
            deviceNameProvider = { "Pixel Test" },
        )

        viewModel.onQrScanned(
            "harold://pair?v=1&endpoint=http%3A%2F%2F10.0.2.2%3A3847&code=R7K-4MP",
        )

        assertEquals(
            listOf(
                FakePairingCoordinator.Call(
                    endpoint = "http://10.0.2.2:3847",
                    code = "R7K-4MP",
                    deviceName = "Pixel Test",
                ),
            ),
            coordinator.calls,
        )
        assertTrue(viewModel.uiState.value.completed)
        assertFalse(viewModel.uiState.value.isClaiming)
    }

    @Test
    fun onQrScannedSurfacesParserErrorsWithoutClaiming() = runTest {
        val coordinator = FakePairingCoordinator(Result.success(Unit))
        val viewModel = PairingViewModel(
            pairingCoordinator = coordinator,
            payloadParser = DefaultPairingPayloadParser(rejectCleartext = false),
            deviceNameProvider = { "Pixel Test" },
        )

        viewModel.onQrScanned("not-a-pairing-uri")

        assertTrue(coordinator.calls.isEmpty())
        assertEquals("Invalid pairing URI scheme", viewModel.uiState.value.errorMessage)
        assertFalse(viewModel.uiState.value.completed)
    }

    @Test
    fun submitManualPairingUsesTheSameParserSeam() = runTest {
        val coordinator = FakePairingCoordinator(Result.success(Unit))
        val viewModel = PairingViewModel(
            pairingCoordinator = coordinator,
            payloadParser = DefaultPairingPayloadParser(rejectCleartext = false),
            deviceNameProvider = { "Pixel Test" },
        )

        viewModel.showManualEntry()
        viewModel.onEndpointChanged("http://10.0.2.2:3847")
        viewModel.onCodeChanged("r7k-4mp")
        viewModel.submitManualPairing()

        assertEquals(
            listOf(
                FakePairingCoordinator.Call(
                    endpoint = "http://10.0.2.2:3847",
                    code = "R7K-4MP",
                    deviceName = "Pixel Test",
                ),
            ),
            coordinator.calls,
        )
        assertTrue(viewModel.uiState.value.completed)
    }
}

private class FakePairingCoordinator(
    private val result: Result<Unit>,
) : PairingCoordinator {
    data class Call(
        val endpoint: String,
        val code: String,
        val deviceName: String,
    )

    val calls = mutableListOf<Call>()

    override suspend fun pair(
        endpoint: String,
        code: String,
        deviceName: String,
    ): Result<Unit> {
        calls += Call(endpoint = endpoint, code = code, deviceName = deviceName)
        return result
    }
}
