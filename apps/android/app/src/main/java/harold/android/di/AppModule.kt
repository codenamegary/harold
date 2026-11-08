package harold.android.di

import dagger.Binds
import dagger.Lazy
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import harold.android.network.ConnectionResources
import harold.android.transport.ssh.SshConnectionPool
import javax.inject.Inject
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class AppModule {
    @Binds
    @Singleton
    abstract fun connectionResources(impl: DefaultConnectionResources): ConnectionResources
}

/**
 * Closes pooled SSH sessions when their saved connection is removed or
 * reconfigured. The lazy pool keeps the repository <-> resources cycle from
 * forming during graph construction.
 */
@Singleton
class DefaultConnectionResources @Inject constructor(
    private val connectionPool: Lazy<SshConnectionPool>,
) : ConnectionResources {
    override suspend fun closeConnection(connectionId: String) {
        connectionPool.get().close(connectionId)
    }
}
