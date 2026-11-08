package harold.android.di

import dagger.Binds
import dagger.Lazy
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import harold.android.acp.AgentRuntime
import harold.android.credentials.ConnectionRepository
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
 * Closes live ACP processes first, then pooled SSH sessions when their saved
 * connection is removed or reconfigured. The lazy dependencies keep the
 * repository <-> resources cycle from forming during graph construction.
 */
@Singleton
class DefaultConnectionResources @Inject constructor(
    private val agentRuntime: Lazy<AgentRuntime>,
    private val connectionPool: Lazy<SshConnectionPool>,
    private val connectionRepository: Lazy<ConnectionRepository>,
) : ConnectionResources {
    override suspend fun closeConnection(connectionId: String) {
        val runtime = agentRuntime.get()
        val pool = connectionPool.get()
        // A removed row is already gone from the store; keyFor falls back to
        // the pool's remembered key. A changed row still exists with its new
        // config, so the runtime's remembered key identifies the old entry.
        val key = runtime.rememberedPoolKey(connectionId)
            ?: runCatching { pool.keyFor(connectionId) }.getOrNull()
            ?: return
        val anotherRowUsesKey = connectionRepository.get().list().any { saved ->
            saved.connectionId != connectionId &&
                runCatching { pool.keyFor(saved.connectionId) }.getOrNull() == key
        }
        if (anotherRowUsesKey) {
            return
        }
        runtime.closeConnection(connectionId)
        pool.close(connectionId)
    }
}
