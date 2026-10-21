package harold.android.pairing

import androidx.compose.runtime.getValue
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.EntryProviderScope
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import harold.android.navigation.AppRoute
import harold.android.navigation.FeatureEntryProvider
import harold.android.navigation.Navigator
import harold.android.navigation.Pairing
import javax.inject.Inject
import javax.inject.Singleton

class PairingEntryProvider @Inject constructor() : FeatureEntryProvider {
    override fun register(scope: EntryProviderScope<AppRoute>, navigator: Navigator) {
        scope.entry<Pairing> {
            val viewModel: PairingViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            PairingScreen(
                uiState = uiState,
                onManualEntryClick = viewModel::showManualEntry,
                onScannerClick = viewModel::showScanner,
                onEndpointChanged = viewModel::onEndpointChanged,
                onCodeChanged = viewModel::onCodeChanged,
                onSubmitManual = viewModel::submitManualPairing,
                onQrScanned = viewModel::onQrScanned,
                onBack = { navigator.goBack() },
                onNameChanged = viewModel::onNameChanged,
                onColorSelected = viewModel::onColorSelected,
                onIconSelected = viewModel::onIconSelected,
                onConfirm = viewModel::confirmPairing,
                onConfirmUpdate = viewModel::confirmUpdate,
                onCancelUpdate = viewModel::cancelUpdate,
            )
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class PairingFeatureModule {
    @Binds
    @IntoSet
    abstract fun entryProvider(impl: PairingEntryProvider): FeatureEntryProvider

    @Binds
    @Singleton
    abstract fun pairingPayloadParser(impl: DefaultPairingPayloadParser): PairingPayloadParser

    @Binds
    @Singleton
    abstract fun pairingCoordinator(impl: DefaultPairingCoordinator): PairingCoordinator

    @Binds
    @Singleton
    abstract fun pairingRequests(impl: DefaultPairingRequests): PairingRequests

    companion object {
        @Provides
        fun deviceNameProvider(): DeviceNameProvider = DeviceNameProvider { defaultDeviceName() }
    }
}
