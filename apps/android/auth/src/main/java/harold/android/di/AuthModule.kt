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
import harold.android.session.DefaultConnections
import harold.android.session.DefaultSessionGateway
import harold.android.session.Connections
import harold.android.session.SessionGateway
import harold.android.user.DefaultUserRepository
import harold.android.user.UserRepository
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class AuthModule {
    @Binds
    @Singleton
    abstract fun sessionGateway(impl: DefaultSessionGateway): SessionGateway

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
        fun defaultSessionGateway(
            credentialStore: ConnectionStore,
            connections: Connections,
        ): DefaultSessionGateway = DefaultSessionGateway(
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
        ): ConnectionRepository = ConnectionRepository(
            store = credentialStore,
            localCacheCleaner = localCacheCleaner,
        )
    }
}
