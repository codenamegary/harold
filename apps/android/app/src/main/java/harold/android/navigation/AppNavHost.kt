
package harold.android.navigation

import androidx.activity.compose.LocalActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay

@Composable
fun AppNavHost(
    navigator: Navigator,
    entryProviders: Set<FeatureEntryProvider>,
    gates: Set<FeatureGate>,
) {
    val activity = LocalActivity.current
    for (gate in gates) {
        gate.retain()
    }

    NavigationFrame(navigator = navigator) {
        NavDisplay(
            backStack = navigator.backStack,
            onBack = {
                if (!navigator.goBack()) {
                    activity?.finish()
                }
            },
            entryDecorators = listOf(
                rememberSaveableStateHolderNavEntryDecorator(),
                rememberViewModelStoreNavEntryDecorator(),
            ),
            entryProvider = entryProvider {
                val scope = this
                entryProviders.forEach { provider ->
                    provider.register(scope, navigator)
                }
            },
        )
    }
}

@Composable
fun NavigationFrame(
    navigator: Navigator,
    destinations: @Composable () -> Unit,
) {
    if (navigator.backStack.isEmpty()) {
        StartSplash()
    } else {
        destinations()
    }
}

@Composable
fun StartSplash() {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .testTag("start_splash"),
        contentAlignment = Alignment.Center,
    ) {
        CircularProgressIndicator()
    }
}
