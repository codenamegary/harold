package harold.android.acp

import java.io.BufferedReader
import java.io.InputStream
import java.io.OutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

class AcpRemoteException(
    val code: Int,
    val detail: String?,
    val data: JsonElement?,
) : Exception(detail ?: "ACP error $code")

class AcpClosedException(message: String) : Exception(message)

interface AcpClientHandler {
    /** Agent notifications, for example `session/update`. */
    suspend fun onNotification(method: String, params: JsonElement)

    /** Agent-to-client requests, for example `session/request_permission`. */
    suspend fun onRequest(id: String, method: String, params: JsonElement): JsonElement
}

/**
 * JSON-RPC 2.0 client for ACP. Each line on the child's stdio is one message.
 */
class AcpClient(
    private val input: InputStream,
    private val output: OutputStream,
    private val scope: CoroutineScope,
    private val handler: AcpClientHandler,
    private val json: Json = Json { ignoreUnknownKeys = true },
) {
    private val writeLock = Mutex()
    private val pending = ConcurrentHashMap<String, CompletableDeferred<JsonElement>>()
    private val nextId = AtomicLong(1)
    val closed = CompletableDeferred<Throwable?>()
    private var readerJob: Job? = null

    fun start() {
        readerJob = scope.launch(Dispatchers.IO) {
            var cause: Throwable? = null
            try {
                BufferedReader(input.reader()).useLines { lines ->
                    lines.forEach { line -> handleLine(line) }
                }
            } catch (error: Throwable) {
                cause = error
            } finally {
                closed.complete(cause)
                pending.values.forEach { deferred ->
                    deferred.completeExceptionally(
                        AcpClosedException(cause?.message ?: "ACP process closed"),
                    )
                }
                pending.clear()
            }
        }
    }

    suspend fun request(method: String, params: JsonElement, timeoutMillis: Long = 120_000): JsonElement =
        beginRequest(method, params).await(timeoutMillis)

    /**
     * Writes a request and returns before its response arrives. Used by
     * prompts: callers know the write landed, then await the turn elsewhere.
     */
    suspend fun beginRequest(method: String, params: JsonElement): PendingRequest {
        val id = nextId.getAndIncrement()
        val key = id.toString()
        val deferred = CompletableDeferred<JsonElement>()
        pending[key] = deferred
        val message = buildJsonObject {
            put("jsonrpc", "2.0")
            put("id", id)
            put("method", method)
            put("params", params)
        }
        try {
            write(message)
        } catch (error: Throwable) {
            pending.remove(key)
            deferred.completeExceptionally(error)
            throw error
        }
        return PendingRequest(key, deferred)
    }

    inner class PendingRequest internal constructor(
        private val key: String,
        private val deferred: CompletableDeferred<JsonElement>,
    ) {
        suspend fun await(timeoutMillis: Long): JsonElement =
            try {
                withTimeout(timeoutMillis) { deferred.await() }
            } finally {
                pending.remove(key)
            }
    }

    suspend fun notify(method: String, params: JsonElement) {
        val message = buildJsonObject {
            put("jsonrpc", "2.0")
            put("method", method)
            put("params", params)
        }
        write(message)
    }

    fun close() {
        runCatching { output.close() }
        runCatching { input.close() }
        runCatching { readerJob?.cancel() }
        val cause = AcpClosedException("ACP client closed")
        pending.values.forEach { deferred -> deferred.completeExceptionally(cause) }
        pending.clear()
        closed.complete(cause)
    }

    private suspend fun write(message: JsonObject) {
        writeLock.withLock {
            output.write(json.encodeToString(JsonObject.serializer(), message).toByteArray())
            output.write('\n'.code)
            output.flush()
        }
    }

    private fun handleLine(line: String) {
        if (line.isBlank()) {
            return
        }
        val message = runCatching { json.parseToJsonElement(line).jsonObject }.getOrNull() ?: return
        val method = (message["method"] as? JsonPrimitive)?.content
        val idElement = message["id"]
        val id = idElement?.let { element ->
            (element as? JsonPrimitive)?.content
        }

        if (method != null) {
            val params = message["params"] ?: JsonNull
            if (id == null) {
                scope.launch { runCatching { handler.onNotification(method, params) } }
            } else {
                val responseId = idElement ?: JsonNull
                scope.launch {
                    val response = try {
                        buildJsonObject {
                            put("jsonrpc", "2.0")
                            put("id", responseId)
                            put("result", handler.onRequest(id, method, params))
                        }
                    } catch (error: Throwable) {
                        buildJsonObject {
                            put("jsonrpc", "2.0")
                            put("id", responseId)
                            put(
                                "error",
                                buildJsonObject {
                                    put("code", -32603)
                                    put("message", error.message ?: "Client request failed")
                                },
                            )
                        }
                    }
                    runCatching { write(response) }
                }
            }
            return
        }

        if (id == null) {
            return
        }
        val deferred = pending.remove(id) ?: return
        val error = message["error"] as? JsonObject
        if (error != null) {
            deferred.completeExceptionally(
                AcpRemoteException(
                    code = (error["code"] as? JsonPrimitive)?.content?.toIntOrNull() ?: -1,
                    detail = (error["message"] as? JsonPrimitive)?.content,
                    data = error["data"],
                ),
            )
        } else {
            deferred.complete(message["result"] ?: JsonNull)
        }
    }
}

fun acpParams(block: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit): JsonObject =
    buildJsonObject(block)

fun JsonElement.stringValue(key: String): String? =
    (this as? JsonObject)?.get(key)?.let { (it as? JsonPrimitive)?.contentOrNull }

fun JsonElement.intValue(key: String): Int? =
    stringValue(key)?.toIntOrNull()

fun JsonElement.arrayValue(key: String): JsonArray? =
    (this as? JsonObject)?.get(key) as? JsonArray

private val JsonPrimitive.contentOrNull: String?
    get() = if (this is JsonNull) null else content
