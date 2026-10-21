package harold.android.live

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSession
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AuthSessionStatus
import harold.android.contracts.AuthShowMessageLevel
import harold.android.contracts.AuthStep
import harold.android.contracts.ConfigOptionValue
import harold.android.contracts.PromptRequestBody
import harold.android.contracts.SelectOption
import harold.android.contracts.SessionState
import harold.android.contracts.SessionStreamServerMessage
import harold.android.network.SessionCommandApi
import harold.android.stream.ConnectionStatus
import harold.android.stream.DisconnectCause
import harold.android.stream.SessionStream
import harold.android.stream.SessionStreamFactory
import harold.android.stream.SessionStreamHandlers
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultSessionOwnerTest {
    @Test
    fun opensASingleEventStreamForTheWatchTarget() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(liveThen(DisconnectCause.Protocol("stop"))),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()

        assertEquals(1, factory.openCount)
        assertEquals(listOf("cursor" to "sess_01"), factory.openedTargets)
        assertEquals(ConnectionStatus.TransportError("stop"), owner.connectionState.value.status)
    }

    @Test
    fun waitsForAWatchTargetBeforeOpeningAStream() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(liveThen(DisconnectCause.Protocol("stop"))),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(0, factory.openCount)
        // Nothing is watched, so there is no stream to open and the status
        // must not claim to be connecting.
        assertEquals(ConnectionStatus.Idle, owner.connectionState.value.status)

        owner.watch("cursor", "sess_01")
        advanceUntilIdle()

        assertEquals(1, factory.openCount)
    }

    @Test
    fun keepsTheLiveStreamAcrossRedundantConnects() = runTest {
        val factory = ScriptedSessionStreamFactory(listOf(holdOpen()))
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()

        owner.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(1, factory.openCount)
        assertEquals(ConnectionStatus.Live, owner.connectionState.value.status)

        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun closesTheStreamWhenTheLoopIsCancelled() = runTest {
        val loopScope = CoroutineScope(Job() + StandardTestDispatcher(testScheduler))
        val factory = ScriptedSessionStreamFactory(listOf(holdOpen()))
        val owner = DefaultSessionOwner(
            streamFactory = factory,
            commandApi = ScriptedCommandApi(),
            scope = loopScope,
        )

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()

        val stream = requireNotNull(factory.lastStream)
        assertFalse(stream.closed)

        // The loop dies at its wait point, not through a clean disconnect.
        loopScope.cancel()
        advanceUntilIdle()

        assertTrue(stream.closed)
    }

    @Test
    fun foregroundProbeReopensAStreamThatReceivedNothingWhileBackgrounded() = runTest {
        val factory = ScriptedSessionStreamFactory(listOf(holdOpen(), holdOpen()))
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()
        val first = requireNotNull(factory.lastStream)

        owner.onBackground()
        owner.onForeground()
        advanceUntilIdle()

        assertTrue(first.closed)
        assertEquals(2, factory.openCount)
        assertEquals(ConnectionStatus.Live, owner.connectionState.value.status)
        assertEquals(listOf(null, null), factory.openedEventIds)

        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun foregroundKeepsAStreamThatReceivedFramesWhileBackgrounded() = runTest {
        val factory = ScriptedSessionStreamFactory(listOf(holdOpen()))
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()
        val stream = requireNotNull(factory.lastStream)

        owner.onBackground()
        stream.emit(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_01"),
        )
        advanceUntilIdle()
        owner.onForeground()
        advanceUntilIdle()

        assertFalse(stream.closed)
        assertEquals(1, factory.openCount)

        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun closeForBackgroundDropsTheSocketAndTheNextConnectResumesTheWatch() = runTest {
        val factory = ScriptedSessionStreamFactory(listOf(holdOpen(), holdOpen()))
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()
        val first = requireNotNull(factory.lastStream)

        owner.closeForBackground()
        advanceUntilIdle()

        assertTrue(first.closed)
        assertEquals(ConnectionStatus.Idle, owner.connectionState.value.status)

        owner.connect(ORIGIN)
        advanceUntilIdle()

        assertEquals(2, factory.openCount)
        assertEquals(ConnectionStatus.Live, owner.connectionState.value.status)

        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun reconnectSendsTheLastAppliedCursor() = runTest {
        val factory = ScriptedSessionStreamFactory(listOf(holdOpen(), holdOpen()))
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()

        factory.lastStream!!.emit(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_01"),
            cursor = "epoch:4",
        )
        advanceUntilIdle()
        factory.lastStream!!.disconnect(DisconnectCause.Retryable("closed"))
        advanceUntilIdle()

        assertEquals(2, factory.openCount)
        assertEquals(listOf(null, "epoch:4"), factory.openedEventIds)

        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun reconnectKeepsTheTranscriptUntilTheServerSendsAReset() = runTest {
        val factory = ScriptedSessionStreamFactory(listOf(holdOpen(), holdOpen()))
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()

        factory.lastStream!!.emit(
            SessionStreamServerMessage.SessionUpdate(
                agentId = "cursor",
                sessionId = "sess_01",
                update = JsonObject(
                    mapOf(
                        "sessionUpdate" to JsonPrimitive("user_message_chunk"),
                        "text" to JsonPrimitive("before the gap"),
                    ),
                ),
            ),
            cursor = "epoch:1",
        )
        factory.lastStream!!.emit(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_01"),
            cursor = "epoch:1",
        )
        advanceUntilIdle()
        assertEquals(1, owner.snapshot.value.transcript.rows.size)

        factory.lastStream!!.disconnect(DisconnectCause.Retryable("closed"))
        advanceUntilIdle()

        assertEquals(2, factory.openCount)
        assertTrue(owner.snapshot.value.reconnecting)
        assertEquals(1, owner.snapshot.value.transcript.rows.size)

        factory.lastStream!!.emit(
            SessionStreamServerMessage.StreamReset(agentId = "cursor", sessionId = "sess_01"),
        )
        advanceUntilIdle()

        assertTrue(owner.snapshot.value.transcript.rows.isEmpty())

        factory.lastStream!!.emit(
            SessionStreamServerMessage.SessionUpdate(
                agentId = "cursor",
                sessionId = "sess_01",
                update = JsonObject(
                    mapOf(
                        "sessionUpdate" to JsonPrimitive("user_message_chunk"),
                        "text" to JsonPrimitive("replayed"),
                    ),
                ),
            ),
        )
        factory.lastStream!!.emit(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_01"),
            cursor = "epoch:9",
        )
        advanceUntilIdle()

        assertEquals(1, owner.snapshot.value.transcript.rows.size)
        assertTrue(owner.snapshot.value.transcript.live)
        assertFalse(owner.snapshot.value.reconnecting)

        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun foregroundSkipsTheRemainingReconnectBackoff() = runTest {
        val factory = ScriptedSessionStreamFactory(
            scripts = listOf(
                closedWith(DisconnectCause.Retryable("refused")),
                holdOpen(),
            ),
            now = { testScheduler.currentTime },
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        runCurrent()

        advanceTimeBy(100)
        owner.onForeground()
        runCurrent()

        assertEquals(listOf(0L, 100L), factory.openedAt)
        assertEquals(ConnectionStatus.Live, owner.connectionState.value.status)

        owner.disconnect()
        advanceUntilIdle()
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
        owner.watch("cursor", "sess_01")
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
        owner.watch("cursor", "sess_01")
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
        owner.watch("cursor", "sess_01")
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
        owner.watch("cursor", "sess_01")
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
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()
        owner.retry()
        advanceUntilIdle()

        assertEquals(2, factory.openCount)
        assertEquals(ConnectionStatus.TransportError("stop"), owner.connectionState.value.status)
    }

    @Test
    fun watchingADifferentSessionReopensImmediatelyWithoutBackoff() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen(), holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        assertEquals(2, factory.openCount)
        assertEquals(
            listOf("cursor" to "sess_01", "cursor" to "sess_02"),
            factory.openedTargets,
        )
        assertEquals(listOf(0L, 0L), factory.openedAt)
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun watchingTheSameTargetAgainDoesNotReopen() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()

        assertEquals(1, factory.openCount)
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
            "a retryable disconnect re-opens the same watched session",
            listOf("cursor" to "sess_01", "cursor" to "sess_01"),
            factory.openedTargets,
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
        owner.watch("cursor", "sess_01")
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
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()
        owner.connect("http://192.168.1.20:8787")
        owner.watch("cursor", "sess_01")
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
        advanceUntilIdle()

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
    fun promptBeforeSubscribeIsHeldAndPostedAfterSubscribed() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val commands = ScriptedCommandApi()
        val owner = owner(factory, commands)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()

        val accepted = owner.prompt("hello")
        advanceUntilIdle()

        assertTrue(accepted.isSuccess)
        assertTrue(commands.prompts.isEmpty())
        assertEquals(
            "hello",
            (owner.snapshot.value.transcript.rows.first() as TranscriptUserRow).text,
        )

        factory.lastStream!!.emit(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_01"),
        )
        advanceUntilIdle()

        assertEquals(
            listOf(ScriptedCommandApi.PromptCall(agentId = "cursor", sessionId = "sess_01", text = "hello")),
            commands.prompts,
        )
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun promptWhileLivePostsImmediately() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val commands = ScriptedCommandApi()
        val owner = owner(factory, commands)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()
        factory.lastStream!!.emit(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_01"),
        )
        advanceUntilIdle()

        val result = owner.prompt("hello")
        advanceUntilIdle()

        assertTrue(result.isSuccess)
        assertEquals(
            listOf(ScriptedCommandApi.PromptCall(agentId = "cursor", sessionId = "sess_01", text = "hello")),
            commands.prompts,
        )
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun promptWithoutAWatchTargetFailsExplicitly() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val commands = ScriptedCommandApi()
        val owner = owner(factory, commands)

        owner.connect(ORIGIN)
        advanceUntilIdle()

        val result = owner.prompt("hello")

        assertTrue(result.isFailure)
        assertTrue(commands.prompts.isEmpty())
        assertTrue(owner.snapshot.value.transcript.rows.isEmpty())
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun promptFailureSurfacesToTheCaller() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val commands = ScriptedCommandApi()
        commands.promptResult = Result.failure(IllegalStateException("rejected"))
        val owner = owner(factory, commands)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_01")
        advanceUntilIdle()
        factory.lastStream!!.emit(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_01"),
        )
        advanceUntilIdle()

        assertTrue(owner.prompt("hello").isFailure)
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun permissionRequestUpdatesSnapshotAndReplySends() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val commands = ScriptedCommandApi()
        val owner = owner(factory, commands)

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
        val replyResult = owner.replyPermission("perm_01", "allow-once")
        advanceUntilIdle()

        assertTrue(replyResult.isSuccess)
        assertNull(owner.snapshot.value.pendingPermission)
        assertEquals(listOf("perm_01" to "allow-once"), commands.permissionReplies)
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
    fun sessionConfigFramePopulatesSnapshotAndRestoresOnWatchBack() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        factory.lastStream!!.emit(
            SessionStreamServerMessage.SessionConfig(
                agentId = "cursor",
                sessionId = "sess_02",
                configOptions = listOf(selectElement(id = "model", currentValue = "m1")),
            ),
        )
        advanceUntilIdle()

        val options = owner.snapshot.value.configOptions
        assertEquals(listOf("model"), options.map { option -> option.id })
        assertEquals("m1", (options.single() as SelectOption).currentValue)

        owner.watch("cursor", "sess_01")
        advanceUntilIdle()
        assertTrue(owner.snapshot.value.configOptions.isEmpty())

        owner.watch("cursor", "sess_02")
        advanceUntilIdle()
        assertEquals(
            listOf("model"),
            owner.snapshot.value.configOptions.map { option -> option.id },
        )
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun rememberConfigSeedsSelectorsBeforeAnyFrame() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("opencode", "ses_02")
        advanceUntilIdle()

        owner.rememberConfig(
            "opencode",
            "ses_02",
            listOf(
                SelectOption(
                    id = "model",
                    name = "Model",
                    category = "model",
                    currentValue = "m1",
                    options = listOf(ConfigOptionValue(value = "m1", name = "M1")),
                ),
            ),
        )
        advanceUntilIdle()

        val options = owner.snapshot.value.configOptions
        assertEquals(listOf("model"), options.map { option -> option.id })
        assertEquals("m1", (options.single() as SelectOption).currentValue)

        owner.watch("opencode", "ses_01")
        owner.watch("opencode", "ses_02")
        advanceUntilIdle()
        assertEquals(
            listOf("model"),
            owner.snapshot.value.configOptions.map { option -> option.id },
        )
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun sessionConfigFrameDropsInvalidOptionsAndKeepsValidOnes() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        factory.lastStream!!.emit(
            SessionStreamServerMessage.SessionConfig(
                agentId = "cursor",
                sessionId = "sess_02",
                configOptions = listOf(
                    JsonObject(
                        mapOf(
                            "id" to JsonPrimitive("raw"),
                            "name" to JsonPrimitive("Raw"),
                        ),
                    ),
                    selectElement(id = "model", currentValue = "m1"),
                ),
            ),
        )
        advanceUntilIdle()

        assertEquals(
            listOf("model"),
            owner.snapshot.value.configOptions.map { option -> option.id },
        )
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun forgetClearsSessionConfig() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        factory.lastStream!!.emit(
            SessionStreamServerMessage.SessionConfig(
                agentId = "cursor",
                sessionId = "sess_02",
                configOptions = listOf(selectElement(id = "model", currentValue = "m1")),
            ),
        )
        advanceUntilIdle()

        owner.forget("cursor", "sess_02")
        assertTrue(owner.snapshot.value.configOptions.isEmpty())

        owner.watch("cursor", "sess_01")
        advanceUntilIdle()
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()
        assertTrue(owner.snapshot.value.configOptions.isEmpty())
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun disconnectClearsSessionConfig() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen(), holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        factory.lastStream!!.emit(
            SessionStreamServerMessage.SessionConfig(
                agentId = "cursor",
                sessionId = "sess_02",
                configOptions = listOf(selectElement(id = "model", currentValue = "m1")),
            ),
        )
        advanceUntilIdle()

        owner.disconnect()
        advanceUntilIdle()
        assertTrue(owner.snapshot.value.configOptions.isEmpty())

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()
        assertTrue(owner.snapshot.value.configOptions.isEmpty())
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun serverMoveClearsSessionConfig() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen(), holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        factory.lastStream!!.emit(
            SessionStreamServerMessage.SessionConfig(
                agentId = "cursor",
                sessionId = "sess_02",
                configOptions = listOf(selectElement(id = "model", currentValue = "m1")),
            ),
        )
        advanceUntilIdle()

        owner.connect(MOVED_ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()
        assertTrue(owner.snapshot.value.configOptions.isEmpty())
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

    @Test
    fun sessionInfoFrameUpdatesTitlesWithoutTouchingTranscript() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        val rowsBefore = owner.snapshot.value.transcript.rows
        factory.lastStream!!.emit(
            SessionStreamServerMessage.SessionInfo(
                agentId = "cursor",
                sessionId = "sess_02",
                title = "Fix the auth flow",
            ),
        )
        advanceUntilIdle()

        assertEquals(mapOf("cursor:sess_02" to "Fix the auth flow"), owner.sessionTitles.value)
        assertEquals(rowsBefore, owner.snapshot.value.transcript.rows)
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun sessionInfoFramesForOtherSessionsReachTheTitlesMap() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        factory.lastStream!!.emit(
            SessionStreamServerMessage.SessionInfo(
                agentId = "cursor",
                sessionId = "sess_01",
                title = "Renamed elsewhere",
            ),
        )
        advanceUntilIdle()

        assertEquals(mapOf("cursor:sess_01" to "Renamed elsewhere"), owner.sessionTitles.value)
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun rawSessionInfoUpdateLeavesTitlesAndTranscriptAlone() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("opencode", "ses_02")
        advanceUntilIdle()

        val rowsBefore = owner.snapshot.value.transcript.rows
        factory.lastStream!!.emit(
            SessionStreamServerMessage.SessionUpdate(
                agentId = "opencode",
                sessionId = "ses_02",
                update = JsonObject(
                    mapOf(
                        "sessionUpdate" to JsonPrimitive("session_info_update"),
                        "title" to JsonPrimitive("Named by the agent"),
                    ),
                ),
            ),
        )
        advanceUntilIdle()

        assertTrue(owner.sessionTitles.value.isEmpty())
        assertEquals(rowsBefore, owner.snapshot.value.transcript.rows)
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun nullTitleClearsTheRememberedTitle() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        factory.lastStream!!.emit(
            SessionStreamServerMessage.SessionInfo(
                agentId = "cursor",
                sessionId = "sess_02",
                title = "First",
            ),
        )
        factory.lastStream!!.emit(
            SessionStreamServerMessage.SessionInfo(
                agentId = "cursor",
                sessionId = "sess_02",
                title = null,
            ),
        )
        advanceUntilIdle()

        assertTrue(owner.sessionTitles.value.isEmpty())
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun forgetClearsTheRememberedTitle() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        factory.lastStream!!.emit(
            SessionStreamServerMessage.SessionInfo(
                agentId = "cursor",
                sessionId = "sess_02",
                title = "First",
            ),
        )
        advanceUntilIdle()
        owner.forget("cursor", "sess_02")

        assertTrue(owner.sessionTitles.value.isEmpty())
        owner.disconnect()
        advanceUntilIdle()
    }

    @Test
    fun promptCompleteEmitsAPromptCompletionForTheWatchedSession() = runTest {
        val factory = ScriptedSessionStreamFactory(
            listOf(holdOpen()),
        )
        val owner = owner(factory)
        val completions = mutableListOf<Unit>()
        val collection = launch(start = CoroutineStart.UNDISPATCHED) {
            owner.promptCompletions.collect { completions += it }
        }

        owner.connect(ORIGIN)
        owner.watch("cursor", "sess_02")
        advanceUntilIdle()

        factory.lastStream!!.emit(
            SessionStreamServerMessage.Subscribed(agentId = "cursor", sessionId = "sess_02"),
        )
        factory.lastStream!!.emit(
            SessionStreamServerMessage.PromptComplete(agentId = "cursor", sessionId = "sess_02"),
        )
        advanceUntilIdle()

        assertEquals(1, completions.size)
        collection.cancel()
        owner.disconnect()
        advanceUntilIdle()
    }

    private fun TestScope.owner(
        factory: SessionStreamFactory,
        commands: ScriptedCommandApi = ScriptedCommandApi(),
    ): DefaultSessionOwner =
        DefaultSessionOwner(
            streamFactory = factory,
            commandApi = commands,
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

    private fun selectElement(id: String, currentValue: String): JsonObject = JsonObject(
        mapOf(
            "type" to JsonPrimitive("select"),
            "id" to JsonPrimitive(id),
            "name" to JsonPrimitive(id),
            "currentValue" to JsonPrimitive(currentValue),
            "options" to JsonArray(
                listOf(
                    JsonObject(
                        mapOf(
                            "value" to JsonPrimitive(currentValue),
                            "name" to JsonPrimitive(currentValue),
                        ),
                    ),
                ),
            ),
        ),
    )

    private companion object {
        const val ORIGIN = "http://127.0.0.1:8787"
        const val MOVED_ORIGIN = "http://127.0.0.1:9999"
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
    val openedTargets = mutableListOf<Pair<String, String>>()
    val openedEventIds = mutableListOf<String?>()
    var lastStream: ScriptedSessionStream? = null
        private set

    override fun open(
        serverOrigin: String,
        agentId: String,
        sessionId: String,
        lastEventId: String?,
        handlers: SessionStreamHandlers,
    ): SessionStream {
        val index = openCount
        openCount += 1
        openedAt += now()
        openedTargets += agentId to sessionId
        openedEventIds += lastEventId
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
    var closed = false
        private set
    private var frameAtNanos: Long? = null

    override fun close() {
        closed = true
    }

    override fun lastFrameAtNanos(): Long? = frameAtNanos

    fun emit(message: SessionStreamServerMessage, cursor: String? = null) {
        frameAtNanos = (frameAtNanos ?: 0L) + 1
        handlers.onMessage(message, cursor)
    }

    fun disconnect(cause: DisconnectCause) {
        handlers.onDisconnect(cause)
    }
}

private class ScriptedCommandApi : SessionCommandApi {
    data class PromptCall(val agentId: String, val sessionId: String, val text: String)

    val prompts = mutableListOf<PromptCall>()
    val cancels = mutableListOf<Pair<String, String>>()
    val permissionReplies = mutableListOf<Pair<String, String>>()
    val extensionReplies = mutableListOf<Pair<String, JsonElement>>()
    var promptResult: Result<Unit> = Result.success(Unit)

    override suspend fun prompt(
        serverOrigin: String,
        agentId: String,
        sessionId: String,
        body: PromptRequestBody,
    ): Result<Unit> {
        prompts += PromptCall(agentId = agentId, sessionId = sessionId, text = body.text)
        return promptResult
    }

    override suspend fun cancel(
        serverOrigin: String,
        agentId: String,
        sessionId: String,
    ): Result<Unit> {
        cancels += agentId to sessionId
        return Result.success(Unit)
    }

    override suspend fun replyPermission(
        serverOrigin: String,
        requestId: String,
        optionId: String,
    ): Result<Unit> {
        permissionReplies += requestId to optionId
        return Result.success(Unit)
    }

    override suspend fun replyExtension(
        serverOrigin: String,
        requestId: String,
        result: JsonElement,
    ): Result<Unit> {
        extensionReplies += requestId to result
        return Result.success(Unit)
    }
}
