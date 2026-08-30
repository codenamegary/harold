package server.agent.android.live

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import server.agent.android.chat.TranscriptAssistantRow
import server.agent.android.contracts.AgentAuth
import server.agent.android.contracts.AgentAuthSession
import server.agent.android.contracts.AgentAuthStatus
import server.agent.android.contracts.AuthSessionStatus
import server.agent.android.contracts.AuthShowMessageLevel
import server.agent.android.contracts.AuthStep
import server.agent.android.contracts.SessionState
import server.agent.android.contracts.SessionStreamClientMessage
import server.agent.android.contracts.SessionStreamServerMessage
import server.agent.android.events.ConnectionStatus
import server.agent.android.events.DisconnectCause
import server.agent.android.events.SessionStream
import server.agent.android.events.SessionStreamFactory
import server.agent.android.events.SessionStreamHandlers

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultSessionOwnerTest {
    @Test
    fun opensASingleSessionStreamOnConnect() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(liveThen(DisconnectCause.Protocol("stop"))),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(1, factory.openCount)
        assertEquals(ConnectionStatus.TransportError("stop"), owner.connectionState.value.status)
    }

    @Test
    fun reconnectsAfterRetryableDisconnect() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(
                liveThen(DisconnectCause.Retryable("closed")),
                liveThen(DisconnectCause.Protocol("stop")),
            ),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(2, factory.openCount)
        assertEquals(ConnectionStatus.TransportError("stop"), owner.connectionState.value.status)
    }

    @Test
    fun backsOffExponentiallyWithoutJitter() = runTest {
        val factory = ScriptedSessionStreamFactory(
            scripts = List(4) { closedWith(DisconnectCause.Retryable("refused")) } +
                listOf(closedWith(DisconnectCause.Protocol("stop"))),
            now = { testScheduler.currentTime },
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(listOf(0L, 250L, 750L, 1_750L, 3_750L), factory.openedAt)
    }

    @Test
    fun restartsTheBackoffScheduleOnceASocketOpens() = runTest {
        val factory = ScriptedSessionStreamFactory(
            scripts = listOf(
                closedWith(DisconnectCause.Retryable("refused")),
                closedWith(DisconnectCause.Retryable("refused")),
                liveThen(DisconnectCause.Retryable("closed")),
                closedWith(DisconnectCause.Retryable("refused")),
                closedWith(DisconnectCause.Protocol("stop")),
            ),
            now = { testScheduler.currentTime },
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(listOf(0L, 250L, 750L, 1_000L, 1_500L), factory.openedAt)
    }

    @Test
    fun stopsAutoRetryOnUnauthorized() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(liveThen(DisconnectCause.Unauthorized("unauthorized"))),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(1, factory.openCount)
        assertEquals(
            ConnectionStatus.AuthFailed(detail = "unauthorized"),
            owner.connectionState.value.status,
        )
    }

    @Test
    fun retryAfterAuthFailureOpensAgain() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(
                liveThen(DisconnectCause.Unauthorized("unauthorized")),
                liveThen(DisconnectCause.Protocol("stop")),
            ),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        advanceUntilIdle()
        owner.retry()
        advanceUntilIdle()

        assertEquals(2, factory.openCount)
        assertEquals(ConnectionStatus.TransportError("stop"), owner.connectionState.value.status)
    }

    @Test
    fun watchSendsSubscribeOnTheOpenSocket() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        advanceUntilIdle()
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()

        assertEquals(
            listOf(
                SessionStreamClientMessage.Subscribe(agentId = "cursor", sessionId = "sess_01"),
            ),
            factory.lastStream!!.sent,
        )
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun watchSwitchUsesSwitchAfterSubscribe() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        advanceUntilIdle()
        owner.watch("cursor", "sess_01")
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        assertEquals(
            listOf(
                SessionStreamClientMessage.Subscribe(agentId = "cursor", sessionId = "sess_01"),
                SessionStreamClientMessage.Switch(agentId = "cursor", sessionId = "sess_02"),
            ),
            factory.lastStream!!.sent,
        )
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun reconnectClearsTranscriptThenFoldsANewReplay() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(
                liveThen(DisconnectCause.Retryable("closed")),
                holdOpen(),
            ),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()

        assertEquals(2, factory.openCount)
        assertTrue(owner.snapshot.value.reconnecting)
        assertEquals(0, owner.snapshot.value.transcript.rows.size)
        assertEquals(SessionState.Offline, owner.snapshot.value.transcript.sessionState)
        assertEquals(
            SessionStreamClientMessage.Subscribe(agentId = "cursor", sessionId = "sess_01"),
            factory.lastStream!!.sent.single(),
        )

        factory.lastStream!!.emit(
            SessionStreamServerMessage.SessionUpdate(
                agentId = "cursor",
                sessionId = "sess_01",
                update = JsonObject(
                    mapOf(
                        "sessionUpdate" to JsonPrimitive("agent_message_chunk"),
                        "text" to JsonPrimitive("replayed"),
                    ),
                ),
            ),
        )
        factory.lastStream!!.emit(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_01"),
        )
        advanceUntilIdle()

        assertFalse(owner.snapshot.value.reconnecting)
        val lastAssistant = owner.snapshot.value.transcript.rows
            .filterIsInstance<TranscriptAssistantRow>()
            .last()
        assertEquals("replayed", lastAssistant.text)
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun disconnectStopsTheLoop() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(liveThen(DisconnectCause.Retryable("closed"))),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.disconnect()
        advanceUntilIdle()

        assertTrue(factory.openCount <= 1)
        assertEquals(ConnectionStatus.Idle, owner.connectionState.value.status)
    }

    @Test
    fun coldStartsAgainWhenThePairedServerChanges() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(
                liveThen(DisconnectCause.Protocol("stop")),
                liveThen(DisconnectCause.Protocol("stop")),
            ),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        advanceUntilIdle()
        owner.connect("http://192.168.1.20:8787")
        advanceUntilIdle()

        assertEquals(2, factory.openCount)
        assertEquals(ConnectionStatus.TransportError("stop"), owner.connectionState.value.status)
    }

    @Test
    fun deliversAFullSessionLoadReplayWithoutDroppingUpdates() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()

        val replayCount = 200
        repeat(replayCount) { index ->
            factory.lastStream!!.emit(sessionLoadUpdate(index))
        }
        advanceUntilIdle()

        val lastAssistant = owner.snapshot.value.transcript.rows
            .filterIsInstance<TranscriptAssistantRow>()
            .lastOrNull()
            ?.text
            .orEmpty()
        assertTrue(
            "expected chunk-0 in the folded replay, got '$lastAssistant'",
            lastAssistant.contains("chunk-0"),
        )
        assertTrue(
            "session/load replay must not drop the tail, got '$lastAssistant'",
            lastAssistant.contains("chunk-199"),
        )
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun keepsTheFinalAssistantReplyAfterABurstSessionLoadReplay() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        for (message in appReviewWorkflowReplay()) {
            factory.lastStream!!.emit(message)
        }
        advanceUntilIdle()

        val lastAssistant = owner.snapshot.value.transcript.rows
            .filterIsInstance<TranscriptAssistantRow>()
            .lastOrNull()
            ?.text
            .orEmpty()
        assertTrue(
            "expected the replay tail 'Added.' in the transcript, got last assistant: '$lastAssistant'",
            lastAssistant.contains("Added."),
        )
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun watchOtherSessionDropsQueuedFramesFromTheOldInbox() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()

        repeat(50) { index ->
            factory.lastStream!!.emit(
                SessionStreamServerMessage.SessionUpdate(
                    agentId = "cursor",
                    sessionId = "sess_01",
                    update = JsonObject(
                        mapOf(
                            "sessionUpdate" to JsonPrimitive("agent_message_chunk"),
                            "text" to JsonPrimitive("old-$index"),
                        ),
                    ),
                ),
            )
        }

        owner.watch("cursor", "sess_02")
        factory.lastStream!!.emit(
            SessionStreamServerMessage.SessionUpdate(
                agentId = "cursor",
                sessionId = "sess_02",
                update = JsonObject(
                    mapOf(
                        "sessionUpdate" to JsonPrimitive("agent_message_chunk"),
                        "text" to JsonPrimitive("new"),
                    ),
                ),
            ),
        )
        advanceUntilIdle()

        val assistantText = owner.snapshot.value.transcript.rows
            .filterIsInstance<TranscriptAssistantRow>()
            .joinToString("") { row -> row.text }
        assertEquals("new", assistantText)
        assertFalse(assistantText.contains("old-"))
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun promptBeforeSubscribeSendsAfterSubscribed() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()

        owner.prompt("hello")
        advanceUntilIdle()

        assertTrue(
            factory.lastStream!!.sent.none { message ->
                message is SessionStreamClientMessage.Prompt
            },
        )
        assertEquals(
            "hello",
            (owner.snapshot.value.transcript.rows.first() as server.agent.android.chat.TranscriptUserRow).text,
        )

        factory.lastStream!!.emit(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_01"),
        )
        advanceUntilIdle()

        val prompt = factory.lastStream!!.sent.filterIsInstance<SessionStreamClientMessage.Prompt>().single()
        assertEquals("hello", prompt.text)
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun permissionRequestUpdatesSnapshotAndReplySends() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        factory.lastStream!!.emit(
            SessionStreamServerMessage.PermissionRequest(
                requestId = "perm_01",
                agentId = "cursor",
                sessionId = "sess_02",
                params = JsonObject(
                    mapOf(
                        "toolName" to JsonPrimitive("fake-tool"),
                        "options" to kotlinx.serialization.json.JsonArray(
                            listOf(
                                JsonObject(
                                    mapOf(
                                        "optionId" to JsonPrimitive("allow-once"),
                                        "name" to JsonPrimitive("Allow once"),
                                    ),
                                ),
                            ),
                        ),
                    ),
                ),
            ),
        )
        advanceUntilIdle()

        assertEquals("fake-tool", owner.snapshot.value.pendingPermission?.toolName)
        owner.replyPermission("perm_01", "allow-once")
        advanceUntilIdle()

        assertNull(owner.snapshot.value.pendingPermission)
        assertTrue(
            factory.lastStream!!.sent.any { message ->
                message is SessionStreamClientMessage.PermissionReply &&
                    message.optionId == "allow-once"
            },
        )
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun appliesAuthSessionUpdatedForMatchingAgent() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        factory.lastStream!!.emit(
            SessionStreamServerMessage.AuthSessionUpdated(
                agentId = "cursor",
                auth = AgentAuth(
                    agentId = "cursor",
                    status = AgentAuthStatus.NeedsAuth,
                    error = null,
                    session = AgentAuthSession(
                        sessionId = "auth-1",
                        agentId = "cursor",
                        status = AuthSessionStatus.InProgress,
                        steps = listOf(
                            AuthStep.ShowMessage(
                                level = AuthShowMessageLevel.Info,
                                body = "Sign in on the host",
                            ),
                        ),
                        error = null,
                    ),
                ),
            ),
        )
        advanceUntilIdle()

        assertEquals("auth-1", owner.snapshot.value.agentAuth?.session?.sessionId)
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun ignoresAuthSessionUpdatedForOtherAgent() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        factory.lastStream!!.emit(
            SessionStreamServerMessage.AuthSessionUpdated(
                agentId = "other",
                auth = AgentAuth(
                    agentId = "other",
                    status = AgentAuthStatus.NeedsAuth,
                    error = null,
                    session = null,
                ),
            ),
        )
        advanceUntilIdle()

        assertNull(owner.snapshot.value.agentAuth)
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun commandsUpdateDoesNotTouchTranscriptAndRestoresOnWatchBack() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        val rowsBefore = owner.snapshot.value.transcript.rows
        factory.lastStream!!.emit(
            SessionStreamServerMessage.SessionUpdate(
                agentId = "cursor",
                sessionId = "sess_02",
                update = kotlinx.serialization.json.Json.parseToJsonElement(
                    """
                    {
                      "sessionUpdate": "available_commands_update",
                      "availableCommands": [
                        {"name": "plan", "description": "Draft a plan"}
                      ]
                    }
                    """.trimIndent(),
                ),
            ),
        )
        advanceUntilIdle()

        assertEquals(
            listOf("plan"),
            owner.snapshot.value.availableCommands.map { command -> command.name },
        )
        assertEquals(rowsBefore, owner.snapshot.value.transcript.rows)

        owner.watch("cursor", "sess_01")
        advanceUntilIdle()
        assertTrue(owner.snapshot.value.availableCommands.isEmpty())

        owner.watch("cursor", "sess_02")
        advanceUntilIdle()
        assertEquals(
            listOf("plan"),
            owner.snapshot.value.availableCommands.map { command -> command.name },
        )
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun authRequiredStreamErrorSetsFlag() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        factory.lastStream!!.emit(
            SessionStreamServerMessage.Error(
                message = "Agent authentication required",
                agentId = "cursor",
                sessionId = "sess_02",
            ),
        )
        advanceUntilIdle()

        assertTrue(owner.snapshot.value.authRequired)
        assertEquals(SessionState.Error, owner.snapshot.value.transcript.sessionState)
        owner.disconnect()
        advanceUntilIdle()
    }

    private fun TestScope.owner(factory: SessionStreamFactory): DefaultSessionOwner =
        DefaultSessionOwner(
            streamFactory = factory,
            scope = this,
        )

    private fun liveThen(cause: DisconnectCause): Script =
        Script.LiveThenClose(cause)

    private fun closedWith(cause: DisconnectCause): Script =
        Script.ImmediateClose(cause)

    private fun holdOpen(): Script = Script.HoldOpen

    private fun sessionLoadUpdate(index: Int): SessionStreamServerMessage =
        SessionStreamServerMessage.SessionUpdate(
            agentId = "cursor",
            sessionId = "sess_01",
            update = JsonObject(
                mapOf(
                    "sessionUpdate" to JsonPrimitive("agent_message_chunk"),
                    "text" to JsonPrimitive("chunk-$index"),
                ),
            ),
        )

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
    }
}

private fun appReviewWorkflowReplay(): List<SessionStreamServerMessage> {
    val replay = mutableListOf<SessionStreamServerMessage>()
    replay += sessionUpdate(
        "sessionUpdate" to JsonPrimitive("user_message_chunk"),
        "text" to JsonPrimitive("Look up the testing links"),
    )
    repeat(80) { index ->
        replay += sessionUpdate(
            "sessionUpdate" to JsonPrimitive("agent_message_chunk"),
            "content" to JsonObject(
                mapOf(
                    "type" to JsonPrimitive("text"),
                    "text" to JsonPrimitive(if (index == 0) "Group: " else "link "),
                ),
            ),
        )
    }
    repeat(3) { index ->
        replay += toolCallUpdate("early-$index")
    }
    replay += sessionUpdate(
        "sessionUpdate" to JsonPrimitive("user_message_chunk"),
        "text" to JsonPrimitive("Yes go ahead and add."),
    )
    replay += sessionUpdate(
        "sessionUpdate" to JsonPrimitive("agent_thought_chunk"),
        "text" to JsonPrimitive("planning the edit"),
    )
    repeat(6) { index ->
        replay += toolCallUpdate("late-$index")
    }
    replay += sessionUpdate(
        "sessionUpdate" to JsonPrimitive("agent_message_chunk"),
        "content" to JsonObject(
            mapOf(
                "type" to JsonPrimitive("text"),
                "text" to JsonPrimitive("Added."),
            ),
        ),
    )
    replay += SessionStreamServerMessage.Subscribed(
        agentId = "cursor",
        sessionId = "sess_02",
    )
    return replay
}

private fun sessionUpdate(
    vararg fields: Pair<String, kotlinx.serialization.json.JsonElement>,
): SessionStreamServerMessage.SessionUpdate =
    SessionStreamServerMessage.SessionUpdate(
        agentId = "cursor",
        sessionId = "sess_02",
        update = JsonObject(fields.toMap()),
    )

private fun toolCallUpdate(toolCallId: String): SessionStreamServerMessage.SessionUpdate =
    sessionUpdate(
        "sessionUpdate" to JsonPrimitive("tool_call"),
        "toolCallId" to JsonPrimitive(toolCallId),
        "title" to JsonPrimitive("read"),
        "kind" to JsonPrimitive("read"),
        "status" to JsonPrimitive("completed"),
    )

private sealed interface Script {
    data class LiveThenClose(val cause: DisconnectCause) : Script
    data class ImmediateClose(val cause: DisconnectCause) : Script
    data object HoldOpen : Script
}

private class ScriptedSessionStreamFactory(
    private val scripts: List<Script>,
    private val now: () -> Long = { 0L },
) : SessionStreamFactory {
    var openCount = 0
        private set
    val openedAt = mutableListOf<Long>()
    var lastStream: ScriptedSessionStream? = null
        private set

    override fun open(serverOrigin: String, handlers: SessionStreamHandlers): SessionStream {
        val index = openCount
        openCount += 1
        openedAt += now()
        val script = scripts.getOrElse(index) { scripts.last() }
        val stream = ScriptedSessionStream(handlers)
        lastStream = stream

        when (script) {
            is Script.ImmediateClose -> handlers.onDisconnect(script.cause)
            is Script.LiveThenClose -> {
                handlers.onOpen()
                handlers.onDisconnect(script.cause)
            }
            Script.HoldOpen -> handlers.onOpen()
        }

        return stream
    }
}

private class ScriptedSessionStream(
    private val handlers: SessionStreamHandlers,
) : SessionStream {
    val sent = mutableListOf<SessionStreamClientMessage>()

    override fun send(message: SessionStreamClientMessage) {
        sent += message
    }

    override fun close() = Unit

    fun emit(message: SessionStreamServerMessage) {
        handlers.onMessage(message)
    }
}
