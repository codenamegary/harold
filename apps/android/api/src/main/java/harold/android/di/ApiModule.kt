package harold.android.di

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import harold.android.network.DefaultAgentApi
import harold.android.network.DefaultPairingApi
import harold.android.network.PairingApi
import harold.android.stream.OkHttpSseSessionStreamFactory
import javax.inject.Singleton
import okhttp3.OkHttpClient

/**
 * Server clients. The [AuthenticatedClient] comes from `:auth`, which owns
 * the bearer token. `:transport` binds the transport-neutral interfaces so
 * the app can route between hub HTTP and direct SSH.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class ApiModule {
    @Binds
    @Singleton
    abstract fun pairingApi(impl: DefaultPairingApi): PairingApi

    companion object {
        @Provides
        @Singleton
        @PairingClient
        fun pairingClient(): OkHttpClient = OkHttpClient()

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
        fun okHttpSseSessionStreamFactory(
            @AuthenticatedClient client: OkHttpClient,
        ): OkHttpSseSessionStreamFactory = OkHttpSseSessionStreamFactory(client = client)
    }
}
