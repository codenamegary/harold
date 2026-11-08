package harold.android.acp.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import harold.android.acp.AcpSessionCatalog
import harold.android.acp.AcpSessionStreamFactory
import harold.android.acp.DefaultAcpAgentApi
import harold.android.network.AcpAgentApi
import harold.android.network.SessionCatalogReader
import harold.android.network.SessionCommandApi
import harold.android.network.SessionConfigApi
import harold.android.network.SessionDirectoryProvider
import harold.android.process.AgentProcessRestarter
import harold.android.stream.SessionStreamFactory
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class AcpModule {
    @Binds
    @Singleton
    abstract fun acpAgentApi(impl: DefaultAcpAgentApi): AcpAgentApi

    @Binds
    @Singleton
    abstract fun sessionConfigApi(impl: DefaultAcpAgentApi): SessionConfigApi

    @Binds
    @Singleton
    abstract fun sessionCommandApi(impl: DefaultAcpAgentApi): SessionCommandApi

    @Binds
    @Singleton
    abstract fun sessionStreamFactory(impl: AcpSessionStreamFactory): SessionStreamFactory

    @Binds
    @Singleton
    abstract fun sessionCatalogReader(impl: AcpSessionCatalog): SessionCatalogReader

    @Binds
    @Singleton
    abstract fun sessionDirectoryProvider(impl: AcpSessionCatalog): SessionDirectoryProvider

    @Binds
    @Singleton
    abstract fun agentProcessRestarter(impl: DefaultAcpAgentApi): AgentProcessRestarter
}
