package harold.android.transport.ssh

import java.io.Closeable
import java.io.InputStream
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * ACP terminal capability backed by one SSH exec channel per terminal.
 * Commands run through a login shell so the same PATH that works in an
 * interactive SSH session also finds the agent CLI and its tools.
 */
class SshTerminals(
    private val connection: SshConnection,
    private val scope: CoroutineScope,
) : Closeable {
    private val terminals = ConcurrentHashMap<String, Terminal>()

    suspend fun create(params: JsonObject): String {
        val command = params.string("command") ?: error("terminal/create requires command")
        val args = (params["args"] as? JsonArray)
            ?.mapNotNull { element -> (element as? JsonPrimitive)?.content }
            .orEmpty()
        val cwd = params.string("cwd")
        val env = (params["env"] as? JsonArray)
            ?.mapNotNull { element -> element as? JsonObject }
            ?.mapNotNull { entry ->
                val name = entry.string("name") ?: return@mapNotNull null
                val value = entry.string("value") ?: return@mapNotNull null
                name to value
            }
            .orEmpty()
        val limit = params.string("outputByteLimit")?.toIntOrNull()?.coerceAtLeast(0)
        val terminalId = "term_${System.nanoTime()}"
        val channel = connection.exec(commandLine(command, args, env, cwd))
        val terminal = Terminal(
            id = terminalId,
            channel = channel,
            limit = limit,
            scope = scope,
        )
        terminal.start()
        terminals[terminalId] = terminal
        return terminalId
    }

    suspend fun output(terminalId: String): JsonObject {
        val terminal = terminals[terminalId] ?: error("Unknown terminal $terminalId")
        return terminal.outputJson()
    }

    suspend fun waitForExit(terminalId: String): JsonObject {
        val terminal = terminals[terminalId] ?: error("Unknown terminal $terminalId")
        val code = withTimeout(30 * 60 * 1000L) { terminal.exit.await() }
        return buildJsonObject {
            put("exitCode", code)
        }
    }

    fun kill(terminalId: String) {
        terminals[terminalId]?.channel?.close()
    }

    fun release(terminalId: String) {
        terminals.remove(terminalId)?.channel?.close()
    }

    override fun close() {
        terminals.values.forEach { terminal -> terminal.channel.close() }
        terminals.clear()
    }

    private class Terminal(
        val id: String,
        val channel: SshExecChannel,
        private val limit: Int?,
        private val scope: CoroutineScope,
    ) {
        private val output = StringBuilder()
        private var truncated = false
        private var exitCode: Int? = null
        val exit = CompletableDeferred<Int>()

        fun start() {
            scope.launch(Dispatchers.IO) { pump(channel.stdout) }
            scope.launch(Dispatchers.IO) {
                val code = channel.awaitExit()
                val stderr = channel.stderrText().toByteArray(Charsets.UTF_8)
                append(stderr, stderr.size)
                exitCode = code
                exit.complete(code)
            }
        }

        fun outputJson(): JsonObject = synchronized(output) {
            buildJsonObject {
                put("output", output.toString())
                put("truncated", truncated)
                exitCode?.let { code ->
                    put(
                        "exitStatus",
                        buildJsonObject {
                            put("exitCode", code)
                        },
                    )
                }
            }
        }

        private fun pump(stream: InputStream) {
            val buffer = ByteArray(4096)
            while (true) {
                val read = stream.read(buffer)
                if (read < 0) {
                    return
                }
                append(buffer, read)
            }
        }

        private fun append(buffer: ByteArray, length: Int) {
            synchronized(output) {
                output.append(String(buffer, 0, length, Charsets.UTF_8))
                val max = limit ?: DEFAULT_OUTPUT_LIMIT
                if (max > 0 && output.length > max) {
                    output.delete(0, output.length - max)
                    truncated = true
                }
            }
        }
    }

    companion object {
        private const val DEFAULT_OUTPUT_LIMIT = 1_000_000

        private fun commandLine(
            command: String,
            args: List<String>,
            env: List<Pair<String, String>>,
            cwd: String?,
        ): String {
            val script = buildString {
                if (cwd != null) {
                    append("cd ")
                    append(SshSessionStore.shellQuote(cwd))
                    append(" && ")
                }
                if (env.isNotEmpty()) {
                    append("env ")
                    env.forEach { (name, value) ->
                        append(name)
                        append('=')
                        append(SshSessionStore.shellQuote(value))
                        append(' ')
                    }
                }
                append("exec ")
                append(SshSessionStore.shellQuote(command))
                args.forEach { arg ->
                    append(' ')
                    append(SshSessionStore.shellQuote(arg))
                }
            }
            return "exec bash -lc ${SshSessionStore.shellQuote(script)}"
        }

        private fun JsonObject.string(key: String): String? =
            (this[key] as? JsonPrimitive)?.content
    }
}
