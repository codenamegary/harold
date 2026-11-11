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
import javax.inject.Inject

class ChangesEntryProvider @Inject constructor() : FeatureEntryProvider {
    override fun register(scope: EntryProviderScope<AppRoute>, navigator: Navigator) {
        scope.entry<Changes> { route ->
            val viewModel: ChangesViewModel = hiltViewModel()
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            LaunchedEffect(
                route.connectionId,
                route.agentId,
                route.sessionId,
                route.cwd,
                route.worktreePath,
            ) {
                viewModel.start(
                    connectionId = route.connectionId,
                    agentId = route.agentId,
                    sessionId = route.sessionId,
                    cwd = route.cwd,
                    worktreePath = route.worktreePath,
                )
            }
            ResumeChanges(viewModel)
            ChangesProbeEffect(
                viewModel = viewModel,
                onOpenFile = { file ->
                    // Read the selected worktree and scope at call time, not at
                    // install time, so the probe never opens a stale diff.
                    val current = viewModel.uiState.value
                    navigator.openFileDiff(
                        connectionId = route.connectionId,
                        worktreePath = current.selectedWorktreePath,
                        scope = current.scope,
                        filePath = file.path,
                        oldPath = file.oldPath,
                    )
                },
                onBack = { navigator.goBack() },
            )
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
                        connectionId = route.connectionId,
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
                route.connectionId,
                route.worktreePath,
                route.scope,
                route.filePath,
                route.oldPath,
            ) {
                viewModel.start(
                    connectionId = route.connectionId,
                    worktreePath = route.worktreePath,
                    scope = route.scope,
                    filePath = route.filePath,
                    oldPath = route.oldPath,
                )
            }
            FileDiffProbeEffect(
                viewModel = viewModel,
                onBack = { navigator.goBack() },
            )
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
}
