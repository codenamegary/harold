package harold.android.debug

import android.content.Context
import android.util.Log
import harold.android.ui.debug.Probe
import java.io.BufferedInputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.URLDecoder
import java.security.SecureRandom
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

/**
 * Loopback JSON control plane for the debug build.
 *
 * Deliberately not MCP. The protocol surface the driver needs is four routes and
 * a flat snapshot, and keeping MCP on the host means no protocol code ships in
 * the APK and no network listener exists in a release build.
 *
 * Reach it from the host with `adb forward tcp:7391 tcp:7391`.
 */
object ProbeServer {
    const val TAG = "HaroldProbe"
    const val DEFAULT_PORT = 7391

    private const val HEADER_TOKEN = "x-probe-token"

    private val pool = Executors.newFixedThreadPool(4)

    @Volatile
    private var serverSocket: ServerSocket? = null

    @Volatile
    var token: String = ""
        private set

    @Volatile
    var port: Int = DEFAULT_PORT
        private set

    fun start(context: Context, requestedPort: Int = DEFAULT_PORT) {
        Probe.enabled = true
        token = newToken()
        val socket = try {
            ServerSocket(requestedPort, 16, InetAddress.getByName("127.0.0.1"))
        } catch (error: Exception) {
            Log.e(TAG, "could not bind 127.0.0.1:$requestedPort", error)
            return
        }
        port = socket.localPort
        serverSocket = socket
        Log.i(TAG, "listening host=127.0.0.1 port=$port token=$token")
        Thread({ acceptLoop(socket) }, "harold-probe-accept").apply { isDaemon = true }.start()
    }

    private fun acceptLoop(socket: ServerSocket) {
        while (!socket.isClosed) {
            val client = runCatching { socket.accept() }.getOrNull() ?: return
            pool.execute {
                runCatching { handle(client) }
                    .onFailure { error -> Log.w(TAG, "request failed: ${error.message}") }
            }
        }
    }

    private fun handle(socket: java.net.Socket) {
        socket.use { client ->
            // Long enough for a whole typed sentence at a legible cadence.
            client.soTimeout = 120_000
            val request = readRequest(BufferedInputStream(client.getInputStream())) ?: return
            val (status, payload) = runCatching { route(request) }
                .getOrElse { error -> 500 to errorJson(error.message ?: "internal error") }
            writeResponse(client.getOutputStream(), status, payload)
        }
    }

    private fun route(request: Request): Pair<Int, String> {
        if (request.headers[HEADER_TOKEN] != token) {
            return 401 to errorJson("bad or missing $HEADER_TOKEN")
        }
        return when {
            request.method == "GET" && request.path == "/health" ->
                200 to JSONObject()
                    .put("ok", true)
                    .put("screen", Probe.current()?.name ?: JSONObject.NULL)
                    .put("token", token)
                    .toString()

            request.method == "GET" && request.path == "/screen" ->
                200 to screenJson().toString()

            request.method == "GET" && request.path == "/marks" ->
                200 to marksJson(request.query["since"]?.toIntOrNull() ?: 0).toString()

            request.method == "POST" && request.path == "/marks/clear" -> {
                Probe.clearMarks()
                200 to JSONObject().put("ok", true).toString()
            }

            request.method == "POST" && request.path == "/anchor" ->
                200 to JSONObject().put("anchorNanos", Probe.anchor()).toString()

            request.method == "POST" && request.path == "/intent" -> intent(request.body)

            else -> 404 to errorJson("no route ${request.method} ${request.path}")
        }
    }

    private fun intent(body: String): Pair<Int, String> {
        val payload = runCatching { JSONObject(body) }.getOrNull()
            ?: return 400 to errorJson("body must be a JSON object")
        val action = payload.optString("action").takeIf { it.isNotEmpty() }
            ?: return 400 to errorJson("action is required")
        val probe = Probe.current() ?: return 409 to errorJson("no screen probe installed")

        val argsObject = payload.optJSONObject("args") ?: JSONObject()
        val args = argsObject.keys().asSequence().associateWith { key -> argsObject.optString(key) }

        val before = Probe.marksCount()
        val ok = synchronized(probe) { probe.perform(action, args) }
        val response = screenJson()
            .put("ok", ok)
            .put("action", action)
            .put("marks", marksJson(before))
        return (if (ok) 200 else 422) to response.toString()
    }

    private fun screenJson(): JSONObject {
        val probe = Probe.current()
        val controls = JSONArray()
        for (control in Probe.controls()) {
            controls.put(
                JSONObject()
                    .put("tag", control.tag)
                    .put("left", control.left)
                    .put("top", control.top)
                    .put("right", control.right)
                    .put("bottom", control.bottom)
                    .put("x", control.centerX)
                    .put("y", control.centerY)
                    .put("enabled", control.enabled),
            )
        }
        val facts = JSONObject()
        probe?.facts()?.forEach { (key, value) -> facts.put(key, value) }
        val actions = JSONArray()
        probe?.actions()?.forEach { action -> actions.put(action) }
        return JSONObject()
            .put("screen", probe?.name ?: JSONObject.NULL)
            .put("settled", probe?.settled() ?: true)
            .put("actions", actions)
            .put("facts", facts)
            .put("controls", controls)
            .put("marksCount", Probe.marksCount())
            .put("anchorNanos", Probe.anchorNanos)
    }

    private fun marksJson(since: Int): JSONArray {
        val marks = JSONArray()
        for (mark in Probe.marksSince(since)) {
            marks.put(JSONObject().put("nanos", mark.nanos).put("kind", mark.kind))
        }
        return marks
    }

    private fun errorJson(message: String): String =
        JSONObject().put("ok", false).put("error", message).toString()

    private data class Request(
        val method: String,
        val path: String,
        val query: Map<String, String>,
        val headers: Map<String, String>,
        val body: String,
    )

    private fun readRequest(input: InputStream): Request? {
        val head = readUntil(input, CRLF_CRLF) ?: return null
        val headerText = String(head, Charsets.ISO_8859_1)
        val lines = headerText.split("\r\n").filter { line -> line.isNotEmpty() }
        if (lines.isEmpty()) {
            return null
        }
        val requestLine = lines.first().split(" ")
        if (requestLine.size < 2) {
            return null
        }
        val headers = lines.drop(1).mapNotNull { line ->
            val index = line.indexOf(':')
            if (index <= 0) {
                null
            } else {
                line.substring(0, index).trim().lowercase() to line.substring(index + 1).trim()
            }
        }.toMap()
        val length = headers["content-length"]?.toIntOrNull() ?: 0
        val bodyBytes = if (length > 0) readExactly(input, length) else ByteArray(0)
        val target = requestLine[1]
        return Request(
            method = requestLine[0].uppercase(),
            path = target.substringBefore('?'),
            query = parseQuery(target.substringAfter('?', "")),
            headers = headers,
            body = String(bodyBytes, Charsets.UTF_8),
        )
    }

    private fun parseQuery(raw: String): Map<String, String> =
        raw.split('&')
            .filter { pair -> pair.isNotEmpty() }
            .associate { pair ->
                val key = URLDecoder.decode(pair.substringBefore('='), "UTF-8")
                key to URLDecoder.decode(pair.substringAfter('=', ""), "UTF-8")
            }

    private fun readUntil(input: InputStream, terminator: ByteArray): ByteArray? {
        val buffer = ArrayList<Byte>(1024)
        var matched = 0
        while (true) {
            val next = input.read()
            if (next < 0) {
                return null
            }
            buffer.add(next.toByte())
            matched = if (next.toByte() == terminator[matched]) {
                matched + 1
            } else if (next.toByte() == terminator[0]) {
                1
            } else {
                0
            }
            if (matched == terminator.size) {
                return buffer.toByteArray().copyOfRange(0, buffer.size - terminator.size)
            }
            if (buffer.size > 64 * 1024) {
                return null
            }
        }
    }

    private fun readExactly(input: InputStream, length: Int): ByteArray {
        val out = ByteArray(length)
        var read = 0
        while (read < length) {
            val chunk = input.read(out, read, length - read)
            if (chunk < 0) {
                break
            }
            read += chunk
        }
        return out
    }

    private fun writeResponse(output: OutputStream, status: Int, body: String) {
        val bytes = body.toByteArray(Charsets.UTF_8)
        val head = buildString {
            append("HTTP/1.1 ").append(status).append(' ').append(statusText(status)).append("\r\n")
            append("content-type: application/json\r\n")
            append("content-length: ").append(bytes.size).append("\r\n")
            append("connection: close\r\n\r\n")
        }
        output.write(head.toByteArray(Charsets.ISO_8859_1))
        output.write(bytes)
        output.flush()
    }

    private fun statusText(status: Int): String = when (status) {
        200 -> "OK"
        400 -> "Bad Request"
        401 -> "Unauthorized"
        404 -> "Not Found"
        409 -> "Conflict"
        422 -> "Unprocessable Entity"
        else -> "Internal Server Error"
    }

    private fun newToken(): String {
        val bytes = ByteArray(16)
        SecureRandom().nextBytes(bytes)
        return bytes.joinToString("") { byte -> "%02x".format(byte) }
    }

    private val CRLF_CRLF = byteArrayOf(
        '\r'.code.toByte(),
        '\n'.code.toByte(),
        '\r'.code.toByte(),
        '\n'.code.toByte(),
    )
}
