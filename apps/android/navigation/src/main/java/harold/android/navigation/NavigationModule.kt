package harold.android.navigation

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class NavigationModule {
    @Binds
    @Singleton
    abstract fun navigationPreferences(impl: DefaultNavigationPreferences): NavigationPreferences

    @Binds
    @Singleton
    abstract fun sessionPreferences(impl: DefaultSessionPreferences): SessionPreferences

    @Multibinds
    abstract fun entryProviders(): Set<FeatureEntryProvider>

    @Multibinds
    abstract fun activityEffects(): Set<ActivityEffect>
}
