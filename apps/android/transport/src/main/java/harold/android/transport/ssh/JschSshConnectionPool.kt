package harold.android.transport.ssh

import com.jcraft.jsch.JSchException
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SshAuth
import harold.android.credentials.SshConfig
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Shares one authenticated SSH session per host identity. Saved connections
 * with the same endpoint and credentials map to the same entry; a saved row
 * can be removed or edited without losing track of the entry it was using.
 */
@Singleton
class JschSshConnectionPool @Inject constructor(
    private val savedConnections: ConnectionRepository,
    private val connectionFactory: SshConnectionFactory,
) : SshConnectionPool {
    private val lock = Any()
    private val entries = mutableMapOf<String, Entry>()
    private val connectLocks = mutableMapOf<String, Mutex>()
    private val seenKeys = mutableMapOf<String, String>()

    override suspend fun acquire(connectionId: String): SshConnectionLease {
        val config = savedConnections.find(connectionId)?.ssh
            ?: throw SshException("Saved connection not found: $connectionId")
        val key = keyOf(config)
        synchronized(lock) {
            seenKeys[connectionId] = key
        }
        val connectLock = synchronized(lock) {
            connectLocks.getOrPut(key) { Mutex() }
        }
        return connectLock.withLock {
            var entry = synchronized(lock) {
                val existing = entries[key]
                if (existing != null && existing.isUsable()) {
                    existing.leases += 1
                    existing
                } else {
                    null
                }
            }
            if (entry == null) {
                val stale = synchronized(lock) {
                    entries.remove(key)?.also { removed -> removed.broken = true }
                }
                stale?.let { removed -> runCatching { removed.connection.close() } }
                val connection = connectionFactory.connect(config)
                entry = synchronized(lock) {
                    Entry(key = key, connection = connection).also { created ->
                        created.leases = 1
                        entries[key] = created
                    }
                }
            }
            Lease(key = key, entry = checkNotNull(entry))
        }
    }

    override suspend fun keyFor(connectionId: String): String {
        val saved = savedConnections.find(connectionId)?.ssh
        if (saved != null) {
            return keyOf(saved)
        }
        return synchronized(lock) { seenKeys[connectionId] }
            ?: throw SshException("Saved connection not found: $connectionId")
    }

    override suspend fun close(connectionId: String) {
        val key = synchronized(lock) { seenKeys.remove(connectionId) }
            ?: savedConnections.find(connectionId)?.ssh?.let(::keyOf)
            ?: return
        val anotherRowUsesKey = savedConnections.list().any { saved ->
            saved.connectionId != connectionId && keyOf(saved.ssh) == key
        }
        if (!anotherRowUsesKey) {
            closeKey(key)
        }
    }

    override fun closeKey(key: String) {
        val entry = synchronized(lock) {
            entries.remove(key)?.also { removed -> removed.broken = true }
        }
        entry?.let { removed -> runCatching { removed.connection.close() } }
    }

    override fun closeAll() {
        val closed = synchronized(lock) {
            val all = entries.values.toList()
            entries.clear()
            all.forEach { entry -> entry.broken = true }
            all
        }
        closed.forEach { entry -> runCatching { entry.connection.close() } }
    }

    override fun trimIdle(idleMillis: Long) {
        val now = System.nanoTime()
        val idleNanos = TimeUnit.MILLISECONDS.toNanos(idleMillis)
        val expired = synchronized(lock) {
            val found = entries.values.filter { entry ->
                entry.leases == 0 && now - entry.lastReleasedAt >= idleNanos
            }
            found.forEach { entry ->
                entries.remove(entry.key)
                entry.broken = true
            }
            found
        }
        expired.forEach { entry -> runCatching { entry.connection.close() } }
    }

    private fun keyOf(config: SshConfig): String =
        "ssh://${config.user}@${config.host}:${config.port}" +
            "|credential=sha256:${credentialFingerprint(config.auth)}" +
            "|hostkey=${config.hostKeyFingerprint}"

    private fun credentialFingerprint(auth: SshAuth): String {
        val material = when (auth) {
            is SshAuth.PrivateKey -> auth.pem
            is SshAuth.Password -> auth.secret
        }
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(material.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { byte ->
            ((byte.toInt() and 0xff) + 0x100).toString(16).substring(1)
        }
    }

    private class Entry(
        val key: String,
        val connection: SshConnection,
    ) {
        var leases: Int = 0
        var lastReleasedAt: Long = System.nanoTime()
        var broken: Boolean = false

        fun isUsable(): Boolean = !broken && connection.isConnected
    }

    private inner class Lease(
        override val key: String,
        private val entry: Entry,
    ) : SshConnectionLease {
        private val released = AtomicBoolean(false)

        override val isConnected: Boolean
            get() = entry.connection.isConnected

        override suspend fun exec(command: String): SshExecChannel =
            guarded { entry.connection.exec(command) }

        override suspend fun readFile(path: String): ByteArray =
            guarded { entry.connection.readFile(path) }

        override suspend fun writeFile(path: String, content: ByteArray) =
            guarded { entry.connection.writeFile(path, content) }

        override suspend fun rename(oldPath: String, newPath: String) =
            guarded { entry.connection.rename(oldPath, newPath) }

        override suspend fun list(path: String): List<SshFileEntry> =
            guarded { entry.connection.list(path) }

        override suspend fun stat(path: String): SshFileEntry? =
            guarded { entry.connection.stat(path) }

        override suspend fun mkdir(path: String) =
            guarded { entry.connection.mkdir(path) }

        override suspend fun remove(path: String) =
            guarded { entry.connection.remove(path) }

        override suspend fun realPath(path: String): String =
            guarded { entry.connection.realPath(path) }

        override fun close() {
            if (released.compareAndSet(false, true)) {
                synchronized(lock) {
                    if (entry.leases > 0) {
                        entry.leases -= 1
                    }
                    entry.lastReleasedAt = System.nanoTime()
                }
            }
        }

        private suspend fun <T> guarded(block: suspend () -> T): T {
            try {
                return block()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Throwable) {
                if (isTransportFailure(error)) {
                    breakEntry(entry)
                }
                throw error
            }
        }
    }

    private fun breakEntry(entry: Entry) {
        synchronized(lock) {
            entry.broken = true
            if (entries[entry.key] === entry) {
                entries.remove(entry.key)
            }
        }
        runCatching { entry.connection.close() }
    }

    private fun isTransportFailure(error: Throwable): Boolean =
        error is SshException || error is IOException || error is JSchException
}
