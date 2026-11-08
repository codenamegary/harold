package harold.android.connections

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.EntryProviderScope
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import harold.android.navigation.Agents
import harold.android.navigation.AppRoute
import harold.android.navigation.ConnectionSettings
import harold.android.navigation.FeatureEntryProvider
import harold.android.navigation.Navigator
import harold.android.navigation.Connections
import harold.android.navigation.SshSetup
import javax.inject.Inject
import javax.inject.Singleton

class ConnectionsEntryProvider @Inject constructor() : FeatureEntryProvider {
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
        scope.entry<Connections> {
            val viewModel: ConnectionsViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            ConnectionsScreen(
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
                onOpenSettings = navigator::openConnectionSettings,
                onOpenAgents = navigator::openAgents,
            )
        }
        scope.entry<Agents> { route ->
            val viewModel: AgentsViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            LaunchedEffect(route.connectionId) {
                viewModel.start(route.connectionId)
            }
            AgentsScreen(
                uiState = uiState,
                onBack = viewModel::goBack,
                onScan = viewModel::scan,
                onReload = viewModel::reload,
                onRestart = viewModel::restart,
                onToggleEnabled = viewModel::toggleEnabled,
                onEdit = viewModel::startEdit,
                onDelete = viewModel::delete,
                onRestore = viewModel::restore,
                onEditDisplayNameChanged = viewModel::onEditDisplayNameChanged,
                onEditPathChanged = viewModel::onEditPathChanged,
                onEditArgsChanged = viewModel::onEditArgsChanged,
                onEditEnabledChanged = viewModel::onEditEnabledChanged,
                onSaveEdit = viewModel::saveEdit,
                onCancelEdit = viewModel::cancelEdit,
                onStartCreateCustom = viewModel::startCreateCustom,
                onCreateNameChanged = viewModel::onCreateNameChanged,
                onCreatePathChanged = viewModel::onCreatePathChanged,
                onCreateArgsChanged = viewModel::onCreateArgsChanged,
                onCreateCustom = viewModel::createCustom,
                onCancelCreateCustom = viewModel::cancelCreateCustom,
            )
        }
        scope.entry<ConnectionSettings> { route ->
            val viewModel: ConnectionSettingsViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            LaunchedEffect(route.connectionId) {
                viewModel.start(route.connectionId)
            }
            ConnectionSettingsScreen(
                uiState = uiState,
                onBack = viewModel::goBack,
                onNameChanged = viewModel::onNameChanged,
                onColorSelected = viewModel::onColorSelected,
                onIconSelected = viewModel::onIconSelected,
                onDefaultAgentSelected = viewModel::onDefaultAgentSelected,
                onDefaultWorkspaceChanged = viewModel::onDefaultWorkspaceChanged,
                onCredentialSelected = viewModel::onCredentialSelected,
                onSave = viewModel::save,
                onShowForgetConfirm = viewModel::showForgetConfirm,
                onHideForgetConfirm = viewModel::hideForgetConfirm,
                onForget = viewModel::forget,
            )
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ConnectionsFeatureModule {
    @Binds
    @IntoSet
    abstract fun entryProvider(impl: ConnectionsEntryProvider): FeatureEntryProvider
}
