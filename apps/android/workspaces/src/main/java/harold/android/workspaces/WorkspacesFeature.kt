package harold.android.workspaces

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.EntryProviderScope
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import harold.android.navigation.AddWorkspace
import harold.android.navigation.AppRoute
import harold.android.navigation.FeatureEntryProvider
import harold.android.navigation.Navigator
import harold.android.navigation.Workspaces
import javax.inject.Inject

class WorkspacesEntryProvider @Inject constructor() : FeatureEntryProvider {
    override fun register(scope: EntryProviderScope<AppRoute>, navigator: Navigator) {
        scope.entry<Workspaces> {
            val viewModel: WorkspacesViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            ResumeOnStart(viewModel)
            WorkspacesScreen(
                uiState = uiState,
                onBack = { navigator.goBack() },
                onAddClick = navigator::openAddWorkspace,
            )
        }
        scope.entry<AddWorkspace> {
            val viewModel: AddWorkspaceViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            AddWorkspaceScreen(
                uiState = uiState,
                onBack = { navigator.goBack() },
                onNameChanged = viewModel::onNameChanged,
                onRootChanged = viewModel::onRootChanged,
                onFolderChanged = viewModel::onFolderChanged,
                onFolderQueryChanged = viewModel::onFolderQueryChanged,
                onSubmit = viewModel::submit,
                onHaroldChanged = viewModel::onHaroldChanged,
            )
        }
    }
}

@Composable
private fun ResumeOnStart(viewModel: WorkspacesViewModel) {
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, viewModel) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.refresh()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class WorkspacesFeatureModule {
    @Binds
    @IntoSet
    abstract fun entryProvider(impl: WorkspacesEntryProvider): FeatureEntryProvider
}
