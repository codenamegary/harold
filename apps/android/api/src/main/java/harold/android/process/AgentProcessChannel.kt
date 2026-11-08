package harold.android.process

import java.io.Closeable
import java.io.InputStream
import java.io.OutputStream

/**
 * One launched host process. Closing the channel releases both the process
 * and whatever connection the launcher opened to own it.
 */
interface AgentProcessChannel : Closeable {
    val stdin: OutputStream
    val stdout: InputStream

    /** Human-readable agent or command name used in launch failures. */
    val label: String
        get() = ""

    /** Captured stderr. Safe to read after [awaitExit] or once [isClosed]. */
    fun stderrText(): String

    fun isClosed(): Boolean
    suspend fun awaitExit(): Int
}
