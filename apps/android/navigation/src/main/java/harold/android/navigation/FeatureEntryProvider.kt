package harold.android.navigation

import androidx.navigation3.runtime.EntryProviderScope

fun interface FeatureEntryProvider {
    fun register(scope: EntryProviderScope<AppRoute>, navigator: Navigator)
}
