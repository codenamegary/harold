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
import harold.android.session.ConnectionReachability
import harold.android.stream.SessionStreamFactory
import harold.android.transport.ssh.JschSshConnectionFactory
import harold.android.transport.ssh.SshAgentApi
import harold.android.transport.ssh.SshConnectionFactory
import harold.android.transport.ssh.SshEnrollment
import harold.android.transport.ssh.SshProbe
import harold.android.transport.ssh.SshReachability
import harold.android.transport.ssh.SshSessionStreamFactory
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class TransportModule {
    @Binds
    @Singleton
    abstract fun agentApi(impl: SshAgentApi): AgentApi

    @Binds
    @Singleton
    abstract fun attachmentApi(impl: SshAgentApi): AttachmentApi

    @Binds
    @Singleton
    abstract fun sessionConfigApi(impl: SshAgentApi): SessionConfigApi

    @Binds
    @Singleton
    abstract fun sessionCommandApi(impl: SshAgentApi): SessionCommandApi

    @Binds
    @Singleton
    abstract fun gitApi(impl: SshAgentApi): GitApi

    @Binds
    @Singleton
    abstract fun sessionStreamFactory(impl: SshSessionStreamFactory): SessionStreamFactory

    @Binds
    @Singleton
    abstract fun haroldReachability(impl: SshReachability): ConnectionReachability

    @Binds
    @Singleton
    abstract fun sshConnectionFactory(impl: JschSshConnectionFactory): SshConnectionFactory

    @Binds
    @Singleton
    abstract fun sshProbe(impl: SshEnrollment): SshProbe
}
