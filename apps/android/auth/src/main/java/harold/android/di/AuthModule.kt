package harold.android.di

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import harold.android.database.LocalCacheCleaner
import harold.android.credentials.CredentialStore
import harold.android.credentials.DefaultCredentialStore
import harold.android.credentials.DefaultSshCredentialStore
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.SshCredentialStore
import harold.android.session.DefaultHaroldConnections
import harold.android.session.DefaultSessionGateway
import harold.android.session.HaroldConnections
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
    abstract fun credentialStore(impl: DefaultCredentialStore): CredentialStore

    @Binds
    @Singleton
    abstract fun sshCredentialStore(impl: DefaultSshCredentialStore): SshCredentialStore

    @Binds
    @Singleton
    abstract fun userRepository(impl: DefaultUserRepository): UserRepository

    @Binds
    @Singleton
    abstract fun haroldConnections(impl: DefaultHaroldConnections): HaroldConnections

    companion object {
        @Provides
        @Singleton
        fun defaultSessionGateway(
            credentialStore: CredentialStore,
            connections: HaroldConnections,
        ): DefaultSessionGateway = DefaultSessionGateway(
            credentialStore = credentialStore,
            connections = connections,
        )

        @Provides
        @Singleton
        fun defaultCredentialStore(
            @ApplicationContext context: Context,
        ): DefaultCredentialStore = DefaultCredentialStore(context)

        @Provides
        @Singleton
        fun defaultSshCredentialStore(
            @ApplicationContext context: Context,
        ): DefaultSshCredentialStore = DefaultSshCredentialStore(context)

        @Provides
        @Singleton
        fun savedHaroldRepository(
            credentialStore: CredentialStore,
            localCacheCleaner: LocalCacheCleaner,
        ): SavedHaroldRepository = SavedHaroldRepository(
            store = credentialStore,
            localCacheCleaner = localCacheCleaner,
        )
    }
}
