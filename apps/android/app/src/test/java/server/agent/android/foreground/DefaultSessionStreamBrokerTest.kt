package server.agent.android.foreground

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import server.agent.android.chat.SessionEventSource
import server.agent.android.contracts.EventEnvelope
import server.agent.android.events.EventStreamFactory

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultSessionStreamBrokerTest {
    @Test
    fun keepsStreamPinnedUntilAllReasonsCleared() = runTest {
        val broker = DefaultSessionStreamBroker(
            streamFactory = EventStreamFactory { error("unused") },
            scope = this,
            eventSourceFactory = {
                object : SessionEventSource {
                    override fun observe(
                        serverOrigin: String,
                        sessionId: String,
                        onReconnect: () -> Unit,
                        onEvents: (List<EventEnvelope>) -> Unit,
                    ): Job = launch { }
                }
            },
        )

        broker.pin("https://example.test", "s1", StreamPinReason.Ui)
        broker.pin("https://example.test", "s1", StreamPinReason.Service)
        assertEquals(setOf("s1"), broker.pinnedSessionIds())

        broker.unpin("s1", StreamPinReason.Service)
        assertEquals(setOf("s1"), broker.pinnedSessionIds())

        broker.unpin("s1", StreamPinReason.Ui)
        assertTrue(broker.pinnedSessionIds().isEmpty())
    }

    @Test
    fun unpinAllServiceLeavesUiPins() = runTest {
        val broker = DefaultSessionStreamBroker(
            streamFactory = EventStreamFactory { error("unused") },
            scope = this,
            eventSourceFactory = {
                object : SessionEventSource {
                    override fun observe(
                        serverOrigin: String,
                        sessionId: String,
                        onReconnect: () -> Unit,
                        onEvents: (List<EventEnvelope>) -> Unit,
                    ): Job = launch { }
                }
            },
        )

        broker.pin("https://example.test", "s1", StreamPinReason.Ui)
        broker.pin("https://example.test", "s1", StreamPinReason.Service)
        broker.unpinAll(StreamPinReason.Service)

        assertEquals(setOf("s1"), broker.pinnedSessionIds())
        assertFalse(broker.sessionIdsPinnedFor(StreamPinReason.Service).contains("s1"))
        assertTrue(broker.sessionIdsPinnedFor(StreamPinReason.Ui).contains("s1"))
        advanceUntilIdle()
    }
}
