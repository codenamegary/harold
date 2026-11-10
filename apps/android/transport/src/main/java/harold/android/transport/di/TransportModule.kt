package harold.android.transport.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import harold.android.session.ConnectionReachability
import harold.android.setup.SshSetupApi
import harold.android.transport.ssh.JschSshConnectionFactory
import harold.android.transport.ssh.JschSshConnectionPool
import harold.android.transport.ssh.SshConnectionFactory
import harold.android.transport.ssh.SshConnectionPool
import harold.android.transport.ssh.SshReachability
import harold.android.transport.ssh.SshSetup
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class TransportModule {
    @Binds
    @Singleton
    abstract fun haroldReachability(impl: SshReachability): ConnectionReachability

    @Binds
    @Singleton
    abstract fun sshConnectionFactory(impl: JschSshConnectionFactory): SshConnectionFactory

    @Binds
    @Singleton
    abstract fun sshConnectionPool(impl: JschSshConnectionPool): SshConnectionPool

    @Binds
    @Singleton
    abstract fun sshSetup(impl: SshSetup): SshSetupApi
}
