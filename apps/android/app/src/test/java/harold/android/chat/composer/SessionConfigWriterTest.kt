package harold.android.chat.composer

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import harold.android.contracts.ConfigOption
import harold.android.contracts.ConfigOptionValue
import harold.android.contracts.ConfigValue
import harold.android.contracts.SelectOption
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.network.SessionConfigApi

@OptIn(ExperimentalCoroutinesApi::class)
class SessionConfigWriterTest {
    @Test
    fun pickAppliesOptimisticallyAndSendsTheWrite() = runTest {
        val api = FakeSessionConfigApi()
        val writer = SessionConfigWriter(api, this)
        writer.onSnapshot(ORIGIN, "cursor", "sess_01", listOf(selectOption("model", "m1")))

        writer.set("model", ConfigValue.Text("m2"))

        assertEquals("m2", writer.state.value.model?.selectValue())
        assertTrue(writer.state.value.saving)
        assertNull(writer.state.value.error)

        advanceUntilIdle()
        assertEquals(
            listOf(
                FakeSessionConfigApi.Call(
                    serverOrigin = ORIGIN,
                    agentId = "cursor",
                    sessionId = "sess_01",
                    configId = "model",
                    value = ConfigValue.Text("m2"),
                ),
            ),
            api.calls,
        )
    }

    @Test
    fun echoSettlesTheOptimisticValue() = runTest {
        val api = FakeSessionConfigApi()
        val writer = SessionConfigWriter(api, this)
        writer.onSnapshot(ORIGIN, "cursor", "sess_01", listOf(selectOption("model", "m1")))

        writer.set("model", ConfigValue.Text("m2"))
        advanceUntilIdle()
        writer.onSnapshot(ORIGIN, "cursor", "sess_01", listOf(selectOption("model", "m2")))

        assertEquals("m2", writer.state.value.model?.selectValue())
        assertFalse(writer.state.value.saving)
        assertNull(writer.state.value.error)
    }

    @Test
    fun failureRollsBackAndSurfacesProblemDetail() = runTest {
        val api = FakeSessionConfigApi()
        api.result = Result.failure(
            AgentApiException(
                AgentApiError.Problem(
                    status = 409,
                    title = "Conflict",
                    detail = "Agent is disabled",
                ),
            ),
        )
        val writer = SessionConfigWriter(api, this)
        writer.onSnapshot(ORIGIN, "cursor", "sess_01", listOf(selectOption("model", "m1")))

        writer.set("model", ConfigValue.Text("m2"))
        advanceUntilIdle()

        assertEquals("m1", writer.state.value.model?.selectValue())
        assertFalse(writer.state.value.saving)
        assertEquals("Agent is disabled", writer.state.value.error)
    }

    @Test
    fun newerPickIgnoresTheStaleWrite() = runTest {
        val gate = CompletableDeferred<Result<Unit>>()
        val api = FakeSessionConfigApi()
        api.handler = { call ->
            if (api.calls.size == 1) gate.await() else Result.success(Unit)
        }
        val writer = SessionConfigWriter(api, this)
        writer.onSnapshot(ORIGIN, "cursor", "sess_01", listOf(selectOption("model", "m1")))

        writer.set("model", ConfigValue.Text("m2"))
        advanceUntilIdle()
        writer.set("model", ConfigValue.Text("m3"))
        advanceUntilIdle()

        gate.complete(
            Result.failure(
                AgentApiException(
                    AgentApiError.Problem(status = 409, title = "Conflict", detail = "Stale"),
                ),
            ),
        )
        advanceUntilIdle()

        assertEquals("m3", writer.state.value.model?.selectValue())
        assertNull(writer.state.value.error)
    }

    @Test
    fun sessionSwitchClearsPendingWriteAndError() = runTest {
        val api = FakeSessionConfigApi()
        api.result = Result.failure(
            AgentApiException(
                AgentApiError.Problem(status = 409, title = "Conflict", detail = "Agent is disabled"),
            ),
        )
        val writer = SessionConfigWriter(api, this)
        writer.onSnapshot(ORIGIN, "cursor", "sess_01", listOf(selectOption("model", "m1")))
        writer.set("model", ConfigValue.Text("m2"))
        advanceUntilIdle()
        assertEquals("Agent is disabled", writer.state.value.error)

        writer.onSnapshot(ORIGIN, "cursor", "sess_02", listOf(selectOption("mode", "ask")))

        assertEquals("ask", writer.state.value.mode?.selectValue())
        assertFalse(writer.state.value.saving)
        assertNull(writer.state.value.error)
    }

    @Test
    fun setWithoutAWatchIsANoOp() = runTest {
        val api = FakeSessionConfigApi()
        val writer = SessionConfigWriter(api, this)
        writer.onSnapshot(ORIGIN, null, null, listOf(selectOption("model", "m1")))

        writer.set("model", ConfigValue.Text("m2"))
        advanceUntilIdle()

        assertTrue(api.calls.isEmpty())
        assertEquals("m1", writer.state.value.model?.selectValue())
        assertFalse(writer.state.value.saving)
    }

    private fun selectOption(id: String, currentValue: String): SelectOption = SelectOption(
        id = id,
        name = id,
        category = id,
        currentValue = currentValue,
        options = listOf(ConfigOptionValue(value = currentValue, name = currentValue)),
    )

    private fun ConfigOption?.selectValue(): String? = (this as? SelectOption)?.currentValue

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
    }
}

private class FakeSessionConfigApi : SessionConfigApi {
    data class Call(
        val serverOrigin: String,
        val agentId: String,
        val sessionId: String,
        val configId: String,
        val value: ConfigValue,
    )

    val calls = mutableListOf<Call>()
    var result: Result<Unit> = Result.success(Unit)
    var handler: (suspend (Call) -> Result<Unit>)? = null

    override suspend fun setConfigOption(
        serverOrigin: String,
        agentId: String,
        sessionId: String,
        configId: String,
        value: ConfigValue,
    ): Result<Unit> {
        val call = Call(serverOrigin, agentId, sessionId, configId, value)
        calls += call
        return handler?.invoke(call) ?: result
    }
}
