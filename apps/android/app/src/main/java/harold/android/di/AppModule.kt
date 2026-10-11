package harold.android.di

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import harold.android.credentials.CredentialHolder
import harold.android.credentials.CredentialStore
import harold.android.credentials.DefaultCredentialStore
import harold.android.foreground.ActiveSessionTracker
import harold.android.foreground.AndroidNotificationPermissionChecker
import harold.android.foreground.AndroidSessionForegroundLauncher
import harold.android.foreground.DefaultActiveSessionTracker
import harold.android.foreground.DefaultOpenSessionRequests
import harold.android.foreground.NotificationPermissionChecker
import harold.android.foreground.OpenSessionRequests
import harold.android.foreground.SessionForegroundLauncher
import harold.android.live.DefaultSessionOwner
import harold.android.live.SessionOwner
import harold.android.navigation.DefaultNavigationPreferences
import harold.android.navigation.NavigationPreferences
import harold.android.network.AgentApi
import harold.android.network.AttachmentApi
import harold.android.network.BearerAuthInterceptor
import harold.android.network.DefaultAgentApi
import harold.android.network.DefaultPairingApi
import harold.android.network.PairingApi
import harold.android.network.SessionConfigApi
import harold.android.pairing.DefaultPairingCoordinator
import harold.android.pairing.DefaultPairingPayloadParser
import harold.android.pairing.DefaultPairingRequests
import harold.android.pairing.DeviceNameProvider
import harold.android.pairing.PairingCoordinator
import harold.android.pairing.PairingPayloadParser
import harold.android.pairing.PairingRequests
import harold.android.pairing.defaultDeviceName
import harold.android.session.DefaultSessionGateway
import harold.android.session.SessionGateway
import harold.android.stream.OkHttpSessionStreamFactory
import harold.android.stream.SessionStreamFactory
import harold.android.user.DefaultUserRepository
import harold.android.user.UserRepository
import java.util.concurrent.TimeUnit
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import okhttp3.OkHttpClient

private const val WEB_SOCKET_PING_SECONDS = 20L

@Module
@InstallIn(SingletonComponent::class)
abstract class AppBindings {
    @Binds
    @Singleton
    abstract fun sessionGateway(impl: DefaultSessionGateway): SessionGateway

    @Binds
    @Singleton
    abstract fun credentialStore(impl: DefaultCredentialStore): CredentialStore

    @Binds
    @Singleton
    abstract fun pairingApi(impl: DefaultPairingApi): PairingApi

    @Binds
    @Singleton
    abstract fun pairingPayloadParser(impl: DefaultPairingPayloadParser): PairingPayloadParser

    @Binds
    @Singleton
    abstract fun pairingCoordinator(impl: DefaultPairingCoordinator): PairingCoordinator

    @Binds
    @Singleton
    abstract fun pairingRequests(impl: DefaultPairingRequests): PairingRequests

    @Binds
    @Singleton
    abstract fun agentApi(impl: DefaultAgentApi): AgentApi

    @Binds
    @Singleton
    abstract fun attachmentApi(impl: DefaultAgentApi): AttachmentApi

    @Binds
    @Singleton
    abstract fun sessionConfigApi(impl: DefaultAgentApi): SessionConfigApi

    @Binds
    @Singleton
    abstract fun sessionOwner(impl: DefaultSessionOwner): SessionOwner

    @Binds
    @Singleton
    abstract fun navigationPreferences(impl: DefaultNavigationPreferences): NavigationPreferences

    @Binds
    @Singleton
    abstract fun userRepository(impl: DefaultUserRepository): UserRepository

    @Binds
    @Singleton
    abstract fun activeSessionTracker(impl: DefaultActiveSessionTracker): ActiveSessionTracker

    @Binds
    @Singleton
    abstract fun openSessionRequests(impl: DefaultOpenSessionRequests): OpenSessionRequests

    @Binds
    @Singleton
    abstract fun sessionStreamFactory(impl: OkHttpSessionStreamFactory): SessionStreamFactory

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
        @AuthenticatedClient
        fun authenticatedClient(credentialHolder: CredentialHolder): OkHttpClient =
            OkHttpClient.Builder()
                .addInterceptor(BearerAuthInterceptor(credentialHolder::current))
                .pingInterval(WEB_SOCKET_PING_SECONDS, TimeUnit.SECONDS)
                .build()

        @Provides
        @Singleton
        @PairingClient
        fun pairingClient(): OkHttpClient = OkHttpClient()

        @Provides
        @Singleton
        @ApplicationScope
        fun applicationScope(): CoroutineScope =
            CoroutineScope(SupervisorJob() + Dispatchers.Default)

        @Provides
        @PreviewDispatcher
        fun previewDispatcher(): CoroutineDispatcher = Dispatchers.Default

        @Provides
        fun deviceNameProvider(): DeviceNameProvider = DeviceNameProvider { defaultDeviceName() }

        @Provides
        @Singleton
        fun defaultSessionGateway(
            credentialStore: CredentialStore,
            credentialHolder: CredentialHolder,
        ): DefaultSessionGateway = DefaultSessionGateway(
            credentialStore = credentialStore,
            credentialHolder = credentialHolder,
        )

        @Provides
        @Singleton
        fun defaultCredentialStore(
            @ApplicationContext context: Context,
        ): DefaultCredentialStore = DefaultCredentialStore(context)

        @Provides
        @Singleton
        fun defaultAgentApi(
            @AuthenticatedClient client: OkHttpClient,
        ): DefaultAgentApi = DefaultAgentApi(client = client)

        @Provides
        @Singleton
        fun defaultPairingApi(
            @PairingClient client: OkHttpClient,
        ): DefaultPairingApi = DefaultPairingApi(client)

        @Provides
        @Singleton
        fun okHttpSessionStreamFactory(
            @AuthenticatedClient client: OkHttpClient,
        ): OkHttpSessionStreamFactory = OkHttpSessionStreamFactory(client = client)
    }
}
