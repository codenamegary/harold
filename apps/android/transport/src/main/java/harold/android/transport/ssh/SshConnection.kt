package harold.android.transport.ssh

import harold.android.credentials.SshConfig
import java.io.Closeable
import java.io.InputStream
import java.io.OutputStream
import java.util.concurrent.atomic.AtomicBoolean

class SshException(
    message: String,
    cause: Throwable? = null,
) : Exception(message, cause)

data class SshFileEntry(
    val name: String,
    val path: String,
    val directory: Boolean,
    val size: Long,
    val modifiedAt: Long,
)

data class SshCommandResult(
    val exitCode: Int,
    val stdout: String,
    val stderr: String,
) {
    val succeeded: Boolean get() = exitCode == 0
}

interface SshExecChannel : Closeable {
    val stdin: OutputStream
    val stdout: InputStream

    /** Captured stderr. Safe to read after [awaitExit] or once [isClosed]. */
    fun stderrText(): String

    fun isClosed(): Boolean
    suspend fun awaitExit(): Int
}

/**
 * A loopback listener on this device that forwards every connection to
 * [remotePort] on the host. Closing it removes only the listener. The SSH
 * session that owns it keeps running until its lease is released.
 */
class SshLocalPortForward(
    val localPort: Int,
    val remoteHost: String,
    val remotePort: Int,
    private val release: () -> Unit,
) : Closeable {
    private val closed = AtomicBoolean(false)

    override fun close() {
        if (closed.compareAndSet(false, true)) {
            release()
        }
    }
}

interface SshConnection : Closeable {
    val isConnected: Boolean

    suspend fun exec(command: String): SshExecChannel

    /**
     * Binds `127.0.0.1:[preferredLocalPort]` on this device and forwards it to
     * [remoteHost]:[remotePort] on the host. A null or busy preferred port
     * falls back to a free loopback port. Connections carry raw TCP, so HTTP,
     * websockets and server restarts all behave like a normal local server.
     */
    suspend fun forwardLocalPort(
        remoteHost: String,
        remotePort: Int,
        preferredLocalPort: Int? = null,
    ): SshLocalPortForward =
        throw SshException("This connection cannot forward ports")

    suspend fun readFile(path: String): ByteArray

    suspend fun writeFile(path: String, content: ByteArray)

    /** Atomic within the host filesystem: readers see the old or the new file. */
    suspend fun rename(oldPath: String, newPath: String)

    suspend fun list(path: String): List<SshFileEntry>

    suspend fun stat(path: String): SshFileEntry?

    suspend fun mkdir(path: String)

    suspend fun remove(path: String)

    suspend fun realPath(path: String): String
}

fun interface SshConnectionFactory {
    suspend fun connect(config: SshConfig): SshConnection
}

suspend fun SshConnection.runCommand(command: String): SshCommandResult {
    val channel = exec(command)
    return try {
        val stdout = channel.stdout.bufferedReader().use { it.readText() }
        val exitCode = channel.awaitExit()
        SshCommandResult(
            exitCode = exitCode,
            stdout = stdout,
            stderr = channel.stderrText(),
        )
    } finally {
        channel.close()
    }
}

/** True when [path] exists on the host and is executable by the SSH user. */
suspend fun SshConnection.isExecutable(path: String): Boolean =
    runCommand("test -x ${shellQuote(path)}").succeeded

/** Quotes one argument for a POSIX shell. */
fun shellQuote(value: String): String = "'" + value.replace("'", "'\\''") + "'"
