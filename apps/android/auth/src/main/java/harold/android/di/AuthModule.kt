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
import harold.android.credentials.SavedHaroldBook
import harold.android.network.BearerAuthInterceptor
import harold.android.session.DefaultSessionGateway
import harold.android.session.SessionGateway
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

    companion object {
        @Provides
        @Singleton
        @AuthenticatedClient
        fun authenticatedClient(credentialHolder: CredentialHolder): OkHttpClient =
            OkHttpClient.Builder()
                .addInterceptor(BearerAuthInterceptor(credentialHolder::current))
                .build()

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
        fun savedHaroldBook(
            credentialStore: CredentialStore,
            userRepository: UserRepository,
        ): SavedHaroldBook = SavedHaroldBook(
            store = credentialStore,
            revoke = userRepository::revokeDevice,
        )
    }
}
