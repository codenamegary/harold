package harold.android.pairing

import androidx.compose.runtime.getValue
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.EntryProviderScope
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import harold.android.navigation.AppRoute
import harold.android.navigation.FeatureEntryProvider
import harold.android.navigation.Navigator
import harold.android.navigation.SavedHarolds
import harold.android.navigation.SshSetup
import javax.inject.Inject
import javax.inject.Singleton

class PairingEntryProvider @Inject constructor() : FeatureEntryProvider {
    override fun register(scope: EntryProviderScope<AppRoute>, navigator: Navigator) {
        scope.entry<SshSetup> {
            val viewModel: SshSetupViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            SshSetupScreen(
                uiState = uiState,
                onBack = viewModel::onBack,
                onHostChanged = viewModel::onHostChanged,
                onPortChanged = viewModel::onPortChanged,
                onUserChanged = viewModel::onUserChanged,
                onNameChanged = viewModel::onNameChanged,
                onAuthModeChanged = viewModel::onAuthModeChanged,
                onImportedKeyChanged = viewModel::onImportedKeyChanged,
                onPasswordChanged = viewModel::onPasswordChanged,
                onColorSelected = viewModel::onColorSelected,
                onIconSelected = viewModel::onIconSelected,
                onTrustChanged = viewModel::onTrustChanged,
                onTest = viewModel::testConnection,
                onSave = viewModel::save,
                onCredentialSelected = viewModel::onCredentialSelected,
                onCredentialNameChanged = viewModel::onCredentialNameChanged,
                onSaveCredentialForReuseChanged = viewModel::onSaveCredentialForReuseChanged,
                onDeleteCredential = viewModel::onDeleteCredential,
            )
        }
        scope.entry<SavedHarolds> {
            val viewModel: SavedHaroldsViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            SavedHaroldsScreen(
                uiState = uiState,
                onBack = { navigator.goBack() },
                onAdd = { navigator.openAddConnection() },
                onEdit = viewModel::startEdit,
                onRemove = viewModel::remove,
                onNameChanged = viewModel::onNameChanged,
                onColorSelected = viewModel::onColorSelected,
                onIconSelected = viewModel::onIconSelected,
                onSave = viewModel::saveEdit,
                onCancelEdit = viewModel::cancelEdit,
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
}
