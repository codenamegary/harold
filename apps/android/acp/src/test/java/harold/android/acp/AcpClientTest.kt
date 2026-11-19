package harold.android.acp

import java.io.ByteArrayOutputStream
import java.io.PipedInputStream
import java.io.PipedOutputStream
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A client that does not own an agent-to-client request must stay silent. An
 * error response would make the agent treat the request as dismissed.
 */
class AcpClientTest {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    @Test
    fun aDroppedRequestWritesNoResponse() = runBlocking {
        val seen = CompletableDeferred<Unit>()
        val harness = harness { _, _, _ ->
            seen.complete(Unit)
            throw AcpRequestDroppedException("not this client's request")
        }

        harness.send(request("q1"))
        withTimeout(5_000) { seen.await() }
        delay(300)

        assertEquals("", harness.output.toString(Charsets.UTF_8))
        harness.close()
        scope.cancel()
    }

    @Test
    fun aHandlerFailureStillWritesAnErrorResponse() = runBlocking {
        val seen = CompletableDeferred<Unit>()
        val harness = harness { _, _, _ ->
            seen.complete(Unit)
            error("boom")
        }

        harness.send(request("q1"))
        withTimeout(5_000) { seen.await() }
        val response = harness.awaitResponse()

        assertTrue(response.contains("\"id\":\"q1\""))
        assertTrue(response.contains("\"error\""))
        harness.close()
        scope.cancel()
    }

    @Test
    fun aSuccessfulHandlerWritesTheResult() = runBlocking {
        val seen = CompletableDeferred<Unit>()
        val harness = harness { _, _, _ ->
            seen.complete(Unit)
            JsonNull
        }

        harness.send(request("q1"))
        withTimeout(5_000) { seen.await() }
        val response = harness.awaitResponse()

        assertTrue(response.contains("\"id\":\"q1\""))
        assertTrue(response.contains("\"result\":null"))
        harness.close()
        scope.cancel()
    }

    private fun harness(
        onRequest: suspend (String, String, JsonElement) -> JsonElement,
    ): Harness {
        val input = PipedInputStream()
        val writer = PipedOutputStream(input)
        val output = ByteArrayOutputStream()
        val client = AcpClient(
            input = input,
            output = output,
            scope = scope,
            handler = object : AcpClientHandler {
                override suspend fun onNotification(method: String, params: JsonElement) = Unit

                override suspend fun onRequest(
                    id: String,
                    method: String,
                    params: JsonElement,
                ): JsonElement = onRequest(id, method, params)
            },
        )
        client.start()
        return Harness(writer, output, client)
    }

    private fun request(id: String): String =
        """{"jsonrpc":"2.0","id":"$id","method":"elicitation/create","params":{"sessionId":"ses_1"}}"""

    private inner class Harness(
        private val writer: PipedOutputStream,
        val output: ByteArrayOutputStream,
        private val client: AcpClient,
    ) {
        fun send(json: String) {
            writer.write((json + "\n").toByteArray())
            writer.flush()
        }

        suspend fun awaitResponse(): String {
            withTimeout(5_000) {
                while (output.toString(Charsets.UTF_8).isBlank()) {
                    delay(10)
                }
            }
            return output.toString(Charsets.UTF_8)
        }

        fun close() {
            client.close()
            writer.close()
        }
    }
}
