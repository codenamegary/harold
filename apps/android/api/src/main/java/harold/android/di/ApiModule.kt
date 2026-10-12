package harold.android.di

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import harold.android.network.AgentApi
import harold.android.network.AttachmentApi
import harold.android.network.DefaultAgentApi
import harold.android.network.DefaultPairingApi
import harold.android.network.PairingApi
import harold.android.network.SessionConfigApi
import harold.android.stream.OkHttpSessionStreamFactory
import harold.android.stream.SessionStreamFactory
import javax.inject.Singleton
import okhttp3.OkHttpClient

/** Server clients. The [AuthenticatedClient] comes from `:auth`, which owns the bearer token. */
@Module
@InstallIn(SingletonComponent::class)
abstract class ApiModule {
    @Binds
    @Singleton
    abstract fun pairingApi(impl: DefaultPairingApi): PairingApi

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
    abstract fun sessionStreamFactory(impl: OkHttpSessionStreamFactory): SessionStreamFactory

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
        fun okHttpSessionStreamFactory(
            @AuthenticatedClient client: OkHttpClient,
        ): OkHttpSessionStreamFactory = OkHttpSessionStreamFactory(client = client)
    }
}
