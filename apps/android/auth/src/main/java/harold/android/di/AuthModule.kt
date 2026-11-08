package harold.android.di

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import harold.android.database.LocalCacheCleaner
import harold.android.credentials.ConnectionStore
import harold.android.credentials.DefaultConnectionStore
import harold.android.credentials.DefaultSshCredentialStore
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SshCredentialStore
import harold.android.network.ConnectionResources
import harold.android.session.DefaultConnections
import harold.android.session.DefaultConnectionGateway
import harold.android.session.Connections
import harold.android.session.ConnectionGateway
import harold.android.user.DefaultUserRepository
import harold.android.user.UserRepository
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class AuthModule {
    @Binds
    @Singleton
    abstract fun connectionGateway(impl: DefaultConnectionGateway): ConnectionGateway

    @Binds
    @Singleton
    abstract fun credentialStore(impl: DefaultConnectionStore): ConnectionStore

    @Binds
    @Singleton
    abstract fun sshCredentialStore(impl: DefaultSshCredentialStore): SshCredentialStore

    @Binds
    @Singleton
    abstract fun userRepository(impl: DefaultUserRepository): UserRepository

    @Binds
    @Singleton
    abstract fun connections(impl: DefaultConnections): Connections

    companion object {
        @Provides
        @Singleton
        fun defaultConnectionGateway(
            credentialStore: ConnectionStore,
            connections: Connections,
        ): DefaultConnectionGateway = DefaultConnectionGateway(
            credentialStore = credentialStore,
            connections = connections,
        )

        @Provides
        @Singleton
        fun defaultCredentialStore(
            @ApplicationContext context: Context,
        ): DefaultConnectionStore = DefaultConnectionStore(context)

        @Provides
        @Singleton
        fun defaultSshCredentialStore(
            @ApplicationContext context: Context,
        ): DefaultSshCredentialStore = DefaultSshCredentialStore(context)

        @Provides
        @Singleton
        fun connectionRepository(
            credentialStore: ConnectionStore,
            localCacheCleaner: LocalCacheCleaner,
            connectionResources: ConnectionResources,
        ): ConnectionRepository = ConnectionRepository(
            store = credentialStore,
            localCacheCleaner = localCacheCleaner,
            connectionResources = connectionResources,
        )
    }
}
