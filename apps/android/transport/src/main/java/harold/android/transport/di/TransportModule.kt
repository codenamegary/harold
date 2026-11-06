package harold.android.transport.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import harold.android.network.AgentApi
import harold.android.network.AttachmentApi
import harold.android.network.GitApi
import harold.android.network.SessionCommandApi
import harold.android.network.SessionConfigApi
import harold.android.network.SessionWorktreePathApi
import harold.android.session.HaroldReachability
import harold.android.stream.SessionStreamFactory
import harold.android.transport.routing.RoutingAgentApi
import harold.android.transport.routing.RoutingSessionStreamFactory
import harold.android.transport.routing.TransportHaroldReachability
import harold.android.transport.ssh.JschSshConnectionFactory
import harold.android.transport.ssh.SshConnectionFactory
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class TransportModule {
    @Binds
    @Singleton
    abstract fun agentApi(impl: RoutingAgentApi): AgentApi

    @Binds
    @Singleton
    abstract fun attachmentApi(impl: RoutingAgentApi): AttachmentApi

    @Binds
    @Singleton
    abstract fun sessionConfigApi(impl: RoutingAgentApi): SessionConfigApi

    @Binds
    @Singleton
    abstract fun sessionCommandApi(impl: RoutingAgentApi): SessionCommandApi

    @Binds
    @Singleton
    abstract fun gitApi(impl: RoutingAgentApi): GitApi

    @Binds
    @Singleton
    abstract fun sessionWorktreePathApi(impl: RoutingAgentApi): SessionWorktreePathApi

    @Binds
    @Singleton
    abstract fun sessionStreamFactory(impl: RoutingSessionStreamFactory): SessionStreamFactory

    @Binds
    @Singleton
    abstract fun haroldReachability(impl: TransportHaroldReachability): HaroldReachability

    @Binds
    @Singleton
    abstract fun sshConnectionFactory(impl: JschSshConnectionFactory): SshConnectionFactory
}
