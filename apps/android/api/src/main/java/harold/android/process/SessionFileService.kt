package harold.android.process

/** Reads and writes a session's files on the host for ACP filesystem requests. */
interface SessionFileService {
    suspend fun readTextFile(connectionId: String, path: String): Result<String>

    suspend fun writeTextFile(connectionId: String, path: String, content: String): Result<Unit>

    /**
     * Raw bytes for binary attachment content. Text-only implementations may
     * keep the default, which round-trips through UTF-8.
     */
    suspend fun readBytes(connectionId: String, path: String): Result<ByteArray> =
        readTextFile(connectionId, path).map { content -> content.toByteArray(Charsets.UTF_8) }
}
