package harold.android.transport.ssh

import harold.android.credentials.SshConfig
import java.io.Closeable
import java.io.InputStream
import java.io.OutputStream

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

interface SshConnection : Closeable {
    suspend fun exec(command: String): SshExecChannel

    suspend fun readFile(path: String): ByteArray

    suspend fun writeFile(path: String, content: ByteArray)

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
