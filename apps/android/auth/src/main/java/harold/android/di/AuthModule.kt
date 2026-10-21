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
import harold.android.credentials.SavedHaroldRepository
import harold.android.network.BearerAuthInterceptor
import harold.android.network.serverOriginFromEndpoint
import harold.android.session.DefaultHaroldConnections
import harold.android.session.DefaultSessionGateway
import harold.android.session.HaroldConnections
import harold.android.session.HaroldReachability
import harold.android.session.SessionGateway
import harold.android.session.WorkspaceHaroldReachability
import harold.android.user.DefaultUserRepository
import harold.android.user.UserRepository
import javax.inject.Singleton
import okhttp3.OkHttpClient

@Module
@InstallIn(SingletonComponent::class)
abstract class AuthModule {
    @Binds
    @Singleton
    abstract fun sessionGateway(impl: DefaultSessionGateway): SessionGateway

    @Binds
    @Singleton
    abstract fun credentialStore(impl: DefaultCredentialStore): CredentialStore

    @Binds
    @Singleton
    abstract fun userRepository(impl: DefaultUserRepository): UserRepository

    @Binds
    @Singleton
    abstract fun haroldConnections(impl: DefaultHaroldConnections): HaroldConnections

    @Binds
    abstract fun haroldReachability(impl: WorkspaceHaroldReachability): HaroldReachability

    companion object {
        @Provides
        @Singleton
        @AuthenticatedClient
        fun authenticatedClient(credentialHolder: CredentialHolder): OkHttpClient =
            OkHttpClient.Builder()
                .addInterceptor(
                    BearerAuthInterceptor { url ->
                        credentialHolder.credentialFor(serverOriginFromEndpoint(url.toString()))
                    },
                )
                .build()

        @Provides
        @Singleton
        fun defaultSessionGateway(
            credentialStore: CredentialStore,
            credentialHolder: CredentialHolder,
            connections: HaroldConnections,
        ): DefaultSessionGateway = DefaultSessionGateway(
            credentialStore = credentialStore,
            credentialHolder = credentialHolder,
            connections = connections,
        )

        @Provides
        @Singleton
        fun defaultCredentialStore(
            @ApplicationContext context: Context,
        ): DefaultCredentialStore = DefaultCredentialStore(context)

        @Provides
        @Singleton
        fun savedHaroldRepository(
            credentialStore: CredentialStore,
        ): SavedHaroldRepository = SavedHaroldRepository(credentialStore)
    }
}
