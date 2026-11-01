package harold.android.changes

import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
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
import harold.android.navigation.AppRoute
import harold.android.navigation.Changes
import harold.android.navigation.FeatureEntryProvider
import harold.android.navigation.FileDiff
import harold.android.navigation.Navigator
import harold.android.network.GitApi
import javax.inject.Inject

class ChangesEntryProvider @Inject constructor() : FeatureEntryProvider {
    override fun register(scope: EntryProviderScope<AppRoute>, navigator: Navigator) {
        scope.entry<Changes> { route ->
            val viewModel: ChangesViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            LaunchedEffect(route.serverOrigin, route.cwd) {
                viewModel.start(serverOrigin = route.serverOrigin, cwd = route.cwd)
            }
            ResumeChanges(viewModel)
            ChangesScreen(
                uiState = uiState,
                onBack = { navigator.goBack() },
                onRefresh = viewModel::refresh,
                onRetry = viewModel::retry,
                onWorktreeClick = viewModel::showWorktreeSheet,
                onWorktreeSelect = viewModel::selectWorktree,
                onDismissWorktreeSheet = viewModel::hideWorktreeSheet,
                onScopeSelect = viewModel::selectScope,
                onToggleFolder = viewModel::toggleFolder,
                onToggleAllFolders = viewModel::toggleAllFolders,
                onFileClick = { file ->
                    navigator.openFileDiff(
                        serverOrigin = route.serverOrigin,
                        worktreePath = uiState.selectedWorktreePath,
                        scope = uiState.scope,
                        filePath = file.path,
                        oldPath = file.oldPath,
                    )
                },
            )
        }

        scope.entry<FileDiff> { route ->
            val viewModel: FileDiffViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            LaunchedEffect(
                route.serverOrigin,
                route.worktreePath,
                route.scope,
                route.filePath,
                route.oldPath,
            ) {
                viewModel.start(
                    serverOrigin = route.serverOrigin,
                    worktreePath = route.worktreePath,
                    scope = route.scope,
                    filePath = route.filePath,
                    oldPath = route.oldPath,
                )
            }
            FileDiffScreen(
                uiState = uiState,
                onBack = { navigator.goBack() },
                onRetry = viewModel::retry,
            )
        }
    }
}

@Composable
private fun ResumeChanges(viewModel: ChangesViewModel) {
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, viewModel) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.onResume()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ChangesFeatureModule {
    @Binds
    @IntoSet
    abstract fun entryProvider(impl: ChangesEntryProvider): FeatureEntryProvider

    /**
     * Mock-only binding. When the server slice lands, replace this with
     * `DefaultGitApi` in `ApiModule` and delete [FixtureGitApi].
     */
    @Binds
    abstract fun gitApi(impl: FixtureGitApi): GitApi
}
