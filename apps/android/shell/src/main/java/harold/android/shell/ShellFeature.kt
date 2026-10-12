package harold.android.shell

import androidx.activity.ComponentActivity
import androidx.activity.compose.LocalActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.EntryProviderScope
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import harold.android.navigation.ActivityEffect
import harold.android.navigation.AppRoute
import harold.android.navigation.FeatureEntryProvider
import harold.android.navigation.Navigator
import harold.android.navigation.Shell
import javax.inject.Inject

class RetainShellViewModel @Inject constructor() : ActivityEffect {
    @Composable
    override fun Run() {
        val activity = LocalActivity.current as? ComponentActivity ?: return
        hiltViewModel<ShellViewModel>(viewModelStoreOwner = activity)
    }
}

class ShellEntryProvider @Inject constructor() : FeatureEntryProvider {
    override fun register(scope: EntryProviderScope<AppRoute>, navigator: Navigator) {
        scope.entry<Shell> {
            val activity = LocalActivity.current as? ComponentActivity ?: return@entry
            val viewModel: ShellViewModel = hiltViewModel(viewModelStoreOwner = activity)
            val uiState by viewModel.uiState.collectAsStateWithLifecycle()
            ShellScreen(
                uiState = uiState,
                onPairClick = viewModel::onPairClick,
                onRetryClick = viewModel::onRetryClick,
            )
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ShellFeatureModule {
    @Binds
    @IntoSet
    abstract fun entryProvider(impl: ShellEntryProvider): FeatureEntryProvider

    @Binds
    @IntoSet
    abstract fun retainViewModel(impl: RetainShellViewModel): ActivityEffect
}
