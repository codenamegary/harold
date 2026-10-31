package harold.android.di

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import harold.android.foreground.ActiveSessionTracker
import harold.android.foreground.AndroidNotificationPermissionChecker
import harold.android.foreground.AndroidUserInputAttentionNotifier
import harold.android.foreground.AndroidSessionForegroundLauncher
import harold.android.foreground.DefaultActiveSessionTracker
import harold.android.foreground.DefaultOpenSessionRequests
import harold.android.foreground.DefaultSessionAttentionMarks
import harold.android.foreground.NotificationPermissionChecker
import harold.android.foreground.OpenSessionRequests
import harold.android.foreground.UserInputAttentionNotifier
import harold.android.foreground.SessionAttentionMarks
import harold.android.foreground.SessionForegroundLauncher
import harold.android.live.DefaultSessionOwner
import harold.android.live.SessionOwner
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

@Module
@InstallIn(SingletonComponent::class)
abstract class LiveModule {
    @Binds
    @Singleton
    abstract fun sessionOwner(impl: DefaultSessionOwner): SessionOwner

    @Binds
    @Singleton
    abstract fun activeSessionTracker(impl: DefaultActiveSessionTracker): ActiveSessionTracker

    @Binds
    @Singleton
    abstract fun openSessionRequests(impl: DefaultOpenSessionRequests): OpenSessionRequests

    @Binds
    @Singleton
    abstract fun sessionAttentionMarks(impl: DefaultSessionAttentionMarks): SessionAttentionMarks

    @Binds
    @Singleton
    abstract fun userInputAttentionNotifier(
        impl: AndroidUserInputAttentionNotifier,
    ): UserInputAttentionNotifier

    @Binds
    @Singleton
    abstract fun notificationPermissionChecker(
        impl: AndroidNotificationPermissionChecker,
    ): NotificationPermissionChecker

    @Binds
    @Singleton
    abstract fun sessionForegroundLauncher(
        impl: AndroidSessionForegroundLauncher,
    ): SessionForegroundLauncher

    companion object {
        @Provides
        @Singleton
        @ApplicationScope
        fun applicationScope(): CoroutineScope =
            CoroutineScope(SupervisorJob() + Dispatchers.Default)
    }
}
