
package harold.android.di

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds
import harold.android.navigation.FeatureEntryProvider
import harold.android.navigation.FeatureGate

@Module
@InstallIn(SingletonComponent::class)
abstract class FeatureNavigationModule {
    @Multibinds
    abstract fun entryProviders(): Set<FeatureEntryProvider>

    @Multibinds
    abstract fun gates(): Set<FeatureGate>
}
