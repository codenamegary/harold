package harold.android.transport.ssh

import java.io.InputStream
import java.io.OutputStream
import java.nio.channels.Channels
import java.nio.channels.Pipe

/**
 * A blocking byte pipe used for an SSH exec channel's stdin. The JDK
 * [java.io.PipedInputStream] checks whether the thread that last wrote is
 * still alive and fails once a dispatcher worker retires. This pipe has no
 * thread identity, so a warm agent process stays usable across dispatcher
 * worker churn.
 */
internal class BlockingPipe {
    private val pipe = Pipe.open()

    val input: InputStream = Channels.newInputStream(pipe.source())
    val output: OutputStream = Channels.newOutputStream(pipe.sink())

    fun close() {
        runCatching { input.close() }
        runCatching { output.close() }
    }
}
