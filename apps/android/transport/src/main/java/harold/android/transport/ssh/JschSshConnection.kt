package harold.android.transport.ssh

import com.jcraft.jsch.ChannelExec
import com.jcraft.jsch.ChannelSftp
import com.jcraft.jsch.JSch
import com.jcraft.jsch.Session
import com.jcraft.jsch.SftpException
import harold.android.credentials.SshAuth
import harold.android.credentials.SshConfig
import java.io.ByteArrayInputStream
import java.io.InputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

class JschSshConnection private constructor(
    private val session: Session,
) : SshConnection {
    private val sftpLock = Mutex()
    private var sftpChannel: ChannelSftp? = null

    override suspend fun exec(command: String): SshExecChannel = withContext(Dispatchers.IO) {
        val channel = session.openChannel("exec") as ChannelExec
        channel.setCommand(command)
        // A live pipe keeps remote stdin open for ACP. setInputStream(null)
        // sends EOF immediately, which makes an ACP agent exit.
        val stdinPipe = java.io.PipedInputStream(STDIN_PIPE_SIZE)
        val stdin = java.io.PipedOutputStream(stdinPipe)
        channel.setInputStream(stdinPipe)
        channel.setPty(false)
        val stderr = LimitedByteArrayOutputStream(STDERR_LIMIT_BYTES)
        channel.setErrStream(stderr)
        // JSch starts its stream pipes on the first getInputStream() call. It
        // must happen before connect(), or early stdout is dropped and stderr
        // never reaches EOF.
        val stdout = channel.inputStream
        channel.connect(CONNECT_TIMEOUT_MILLIS)
        JschExecChannel(channel, stdin, stdout, stderr)
    }

    override suspend fun readFile(path: String): ByteArray = withContext(Dispatchers.IO) {
        withSftp { channel ->
            channel.get(path).use { stream -> stream.readBytes() }
        }
    }

    override suspend fun writeFile(path: String, content: ByteArray) = withContext(Dispatchers.IO) {
        withSftp { channel ->
            val slash = path.lastIndexOf('/')
            if (slash > 0) {
                mkdirRecursive(channel, path.substring(0, slash))
            }
            channel.put(ByteArrayInputStream(content), path)
        }
        Unit
    }

    override suspend fun rename(oldPath: String, newPath: String) = withContext(Dispatchers.IO) {
        withSftp { channel ->
            val slash = newPath.lastIndexOf('/')
            if (slash > 0) {
                mkdirRecursive(channel, newPath.substring(0, slash))
            }
            channel.rename(oldPath, newPath)
        }
    }

    override suspend fun list(path: String): List<SshFileEntry> = withContext(Dispatchers.IO) {
        withSftp { channel ->
            val resolved = runCatching { channel.realpath(path) }.getOrDefault(path)
            channel.ls(resolved).mapNotNull { raw ->
                val entry = raw as ChannelSftp.LsEntry
                if (entry.filename == "." || entry.filename == "..") {
                    return@mapNotNull null
                }
                SshFileEntry(
                    name = entry.filename,
                    path = joinPath(resolved, entry.filename),
                    directory = entry.attrs.isDir,
                    size = entry.attrs.size,
                    modifiedAt = entry.attrs.mTime.toLong() * 1000L,
                )
            }
        }
    }

    override suspend fun stat(path: String): SshFileEntry? = withContext(Dispatchers.IO) {
        withSftp { channel -> statLocked(channel, path) }
    }

    override suspend fun mkdir(path: String) = withContext(Dispatchers.IO) {
        withSftp { channel -> mkdirRecursive(channel, path) }
    }

    override suspend fun remove(path: String) = withContext(Dispatchers.IO) {
        withSftp { channel ->
            val entry = statLocked(channel, path)
            if (entry?.directory == true) {
                channel.rmdir(path)
            } else {
                channel.rm(path)
            }
        }
    }

    override suspend fun realPath(path: String): String = withContext(Dispatchers.IO) {
        withSftp { channel -> channel.realpath(path) }
    }

    override fun close() {
        runCatching { sftpChannel?.disconnect() }
        sftpChannel = null
        session.disconnect()
    }

    /**
     * JSch's SFTP channel is not safe for concurrent operations. Every read,
     * write, list, and stat holds the lock for the whole operation so two
     * coroutines on one connection cannot interleave channel traffic.
     */
    private suspend fun <T> withSftp(block: (ChannelSftp) -> T): T = sftpLock.withLock {
        val existing = sftpChannel
        val channel = if (existing != null && existing.isConnected) {
            existing
        } else {
            val opened = session.openChannel("sftp") as ChannelSftp
            opened.connect(CONNECT_TIMEOUT_MILLIS)
            sftpChannel = opened
            opened
        }
        block(channel)
    }

    private fun statLocked(channel: ChannelSftp, path: String): SshFileEntry? =
        try {
            val attrs = channel.lstat(path)
            SshFileEntry(
                name = path.substringAfterLast('/'),
                path = path,
                directory = attrs.isDir,
                size = attrs.size,
                modifiedAt = attrs.mTime.toLong() * 1000L,
            )
        } catch (error: SftpException) {
            if (error.id == ChannelSftp.SSH_FX_NO_SUCH_FILE) {
                null
            } else {
                throw wrap(error)
            }
        }

    private fun mkdirRecursive(channel: ChannelSftp, path: String) {
        if (path.isEmpty() || path == "/") {
            return
        }
        val parent = path.substringBeforeLast('/', "")
        if (parent.isNotEmpty()) {
            mkdirRecursive(channel, parent)
        }
        try {
            channel.mkdir(path)
        } catch (error: SftpException) {
            // Another writer may have created it, or it already exists.
            val exists = runCatching { channel.stat(path) }.isSuccess
            if (!exists) {
                throw wrap(error)
            }
        }
    }

    private class JschExecChannel(
        private val channel: ChannelExec,
        override val stdin: java.io.OutputStream,
        override val stdout: InputStream,
        private val stderr: LimitedByteArrayOutputStream,
    ) : SshExecChannel {

        override fun stderrText(): String = stderr.toString(Charsets.UTF_8.name())

        override fun isClosed(): Boolean = channel.isClosed

        override suspend fun awaitExit(): Int {
            while (!channel.isClosed) {
                delay(EXIT_POLL_MILLIS)
            }
            return channel.exitStatus
        }

        override fun close() {
            runCatching { stdin.close() }
            channel.disconnect()
        }
    }

    private class LimitedByteArrayOutputStream(
        private val limit: Int,
    ) : java.io.ByteArrayOutputStream() {
        override fun write(value: Int) {
            if (count < limit) {
                super.write(value)
            }
        }

        override fun write(buffer: ByteArray, offset: Int, length: Int) {
            val remaining = limit - count
            if (remaining > 0) {
                super.write(buffer, offset, minOf(length, remaining))
            }
        }
    }

    companion object {
        private const val CONNECT_TIMEOUT_MILLIS = 20_000
        private const val EXIT_POLL_MILLIS = 40L
        private const val STDIN_PIPE_SIZE = 64 * 1024
        private const val STDERR_LIMIT_BYTES = 64 * 1024

        fun connect(config: SshConfig): JschSshConnection {
            val jsch = JSch()
            configureJsch(jsch)
            when (val auth = config.auth) {
                is SshAuth.PrivateKey -> {
                    jsch.addIdentity(
                        "harold-${config.connectionId}",
                        auth.pem.toByteArray(Charsets.UTF_8),
                        auth.publicKey.takeIf { key -> key.isNotBlank() }
                            ?.toByteArray(Charsets.UTF_8),
                        null,
                    )
                }
                is SshAuth.Password -> Unit
            }

            val session = jsch.getSession(config.user, config.host, config.port)
            session.setConfig("StrictHostKeyChecking", "yes")
            session.setConfig(
                "PreferredAuthentications",
                "publickey,password,keyboard-interactive",
            )
            session.hostKeyRepository = PinnedHostKeyRepository(config.hostKeyFingerprint)
            if (config.auth is SshAuth.Password) {
                session.setPassword((config.auth as SshAuth.Password).secret)
            }
            session.serverAliveInterval = 15_000
            session.serverAliveCountMax = 3
            session.connect(CONNECT_TIMEOUT_MILLIS)
            return JschSshConnection(session)
        }

        private fun joinPath(parent: String, name: String): String =
            if (parent.endsWith('/')) "$parent$name" else "$parent/$name"

        private fun wrap(error: Exception): SshException =
            if (error is SshException) error else SshException(error.message ?: "SSH failure", error)
    }
}

/** Probes a host without authenticating, so setup can pin the host key safely. */
fun captureHostKeyFingerprint(config: SshConfig): String {
    val jsch = JSch()
    configureJsch(jsch)
    val repository = CapturingHostKeyRepository()
    val session = jsch.getSession(config.user, config.host, config.port)
    session.hostKeyRepository = repository
    session.setConfig("StrictHostKeyChecking", "yes")
    session.setConfig("PreferredAuthentications", "publickey,password,keyboard-interactive")
    var failure: Exception? = null
    try {
        session.connect(10_000)
    } catch (error: Exception) {
        // Auth fails after the host key exchange when the key is not enrolled
        // yet. That is exactly the state setup is in, so capture is enough.
        failure = error
    } finally {
        session.disconnect()
    }
    return repository.captured
        ?: throw SshException(
            "The SSH host did not present a key: ${failure?.message ?: "no host key"}",
            failure,
        )
}
