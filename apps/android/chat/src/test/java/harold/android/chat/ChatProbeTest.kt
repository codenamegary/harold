package harold.android.chat

import harold.android.chat.composer.ComposerConfigUi
import harold.android.contracts.AttachmentKind
import harold.android.contracts.ConfigOptionValue
import harold.android.contracts.SelectOption
import harold.android.contracts.SessionState
import harold.android.live.AcpTranscriptState
import harold.android.live.ContextUsage
import harold.android.live.Elicitation
import harold.android.live.ElicitationDraft
import harold.android.live.ElicitationKind
import harold.android.live.ElicitationOption
import harold.android.live.ElicitationQuestion
import harold.android.live.TranscriptAssistantRow
import harold.android.live.TranscriptUserRow
import harold.android.live.UsageCost
import kotlinx.serialization.json.JsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ChatProbeTest {

    @Test
    fun factsReportTheSessionModeUsageAndAttachmentChips() {
        val probe = ChatProbe(FakeChatProbeHost(stateWithSession()))

        val facts = probe.facts()

        assertEquals("s1", facts["sessionId"])
        assertEquals("Cat screensaver", facts["sessionName"])
        assertEquals("idle", facts["sessionState"])
        assertEquals("plan", facts["mode"])
        assertEquals("agent,plan,build", facts["modeOptions"])
        assertEquals("Claude Sonnet 4.5", facts["model"])
        assertEquals("Read the spec", facts["composerText"])
        assertEquals("true", facts["composerEnabled"])
        assertEquals("true", facts["sendEnabled"])
        assertEquals("2", facts["attachmentCount"])
        assertEquals("mia.jpg|cat-mode.md", facts["attachmentNames"])
        assertEquals("84.2k / 200k (42%) · \$0.045", facts["usage"])
        assertEquals("\$0.045", facts["usageCost"])
        assertEquals("3", facts["changesBadgeCount"])
        assertEquals("All done.", facts["lastAssistantText"])
        assertEquals("false", facts["running"])
        assertEquals("false", facts["composerSubmitting"])
        assertEquals("", facts["error"])
    }

    @Test
    fun factsDescribeThePendingQuestionWithItsOptions() {
        val question = ElicitationQuestion(
            key = "cat_mode",
            title = "Settings toggle or automatic?",
            description = null,
            required = true,
            kind = ElicitationKind.SingleSelect(
                options = listOf(
                    ElicitationOption(value = "settings_toggle", title = "Settings toggle"),
                    ElicitationOption(value = "automatic", title = "Automatic"),
                ),
            ),
        )
        val request = Elicitation.Form(
            requestId = "req_1",
            agentId = "opencode",
            sessionId = "s1",
            message = null,
            raw = JsonObject(emptyMap()),
            questions = listOf(question),
        )
        val state = stateWithSession().copy(
            pendingElicitations = listOf(request),
            elicitationUiState = ElicitationUiState(
                requestId = "req_1",
                showSheet = true,
                draft = ElicitationDraft().withSingle("cat_mode", "settings_toggle"),
            ),
        )
        val probe = ChatProbe(FakeChatProbeHost(state))

        val facts = probe.facts()

        assertEquals("true", facts["elicitationPending"])
        assertEquals("req_1", facts["elicitationRequestId"])
        assertEquals("true", facts["elicitationSheetOpen"])
        assertEquals("Settings toggle or automatic?", facts["elicitationTitle"])
        assertEquals("1", facts["elicitationQuestionCount"])
        assertEquals(
            "cat_mode=settings_toggle:Settings toggle|cat_mode=automatic:Automatic",
            facts["elicitationOptions"],
        )
        assertEquals("true", facts["elicitationDraftValid"])
        assertEquals("false", facts["elicitationSubmitting"])
        assertEquals("waiting", facts["sessionState"])
        // A question waiting on a person is a stable screen; only in-flight
        // work (turn, prompt, reply) makes the probe unsettled.
        assertTrue(probe.settled())
    }

    @Test
    fun settledIsFalseWhileATurnPromptOrQuestionReplyIsInFlight() {
        val running = stateWithSession().copy(
            transcript = AcpTranscriptState(sessionState = SessionState.Running),
        )
        assertFalse(chatProbeSettled(running))

        val submitting = stateWithSession().copy(composerSubmitting = true)
        assertFalse(chatProbeSettled(submitting))

        val replying = stateWithSession().copy(
            elicitationUiState = ElicitationUiState(submitting = true),
        )
        assertFalse(chatProbeSettled(replying))

        assertTrue(chatProbeSettled(stateWithSession()))
    }

    @Test
    fun typingWritesOneCharacterAtATimeAndReportsTheEndOfTheKeys() {
        val host = FakeChatProbeHost(stateWithSession().copy(composerText = ""))
        val probe = ChatProbe(host)

        val ok = probe.perform("type", mapOf("text" to "Mia", "gapMs" to "0"))

        assertTrue(ok)
        assertEquals(
            listOf("setComposerText:", "setComposerText:M", "setComposerText:Mi",
                "setComposerText:Mia"),
            host.calls,
        )
        assertEquals("Mia", host.state().composerText)
    }

    @Test
    fun typingAppendsWhenAsked() {
        val host = FakeChatProbeHost(stateWithSession().copy(composerText = "Read "))
        val probe = ChatProbe(host)

        probe.perform("type", mapOf("text" to "it", "gapMs" to "0", "append" to "true"))

        assertEquals("Read it", host.state().composerText)
    }

    @Test
    fun setModeAcceptsOnlyAValueTheAgentExposes() {
        val host = FakeChatProbeHost(stateWithSession())
        val probe = ChatProbe(host)

        assertFalse(probe.perform("set_mode", mapOf("value" to "cat")))
        assertTrue(host.calls.isEmpty())

        assertTrue(probe.perform("set_mode", mapOf("value" to "build")))
        assertEquals(listOf("setMode:build"), host.calls)
    }

    @Test
    fun pickSessionFindsTheRowTheMenuShows() {
        val row = sessionRow()
        val host = FakeChatProbeHost(stateWithSession().copy(sessions = listOf(row)))
        val probe = ChatProbe(host)

        assertFalse(probe.perform("pick_session", mapOf("id" to "missing")))
        assertTrue(probe.perform("pick_session", mapOf("id" to row.id)))
        assertEquals(listOf("selectSession:${row.id}"), host.calls)
    }

    @Test
    fun removeAttachmentResolvesTheChipNameToItsLocalId() {
        val host = FakeChatProbeHost(stateWithSession())
        val probe = ChatProbe(host)

        assertFalse(probe.perform("remove_attachment", mapOf("name" to "nope")))
        assertTrue(probe.perform("remove_attachment", mapOf("name" to "cat-mode.md")))
        assertEquals(listOf("removeAttachment:att_2"), host.calls)
    }

    @Test
    fun actionsAdvertiseTheFixtureOnlyWhenTheBuildCarriesOne() {
        assertFalse(chatProbeActions(hasFixture = false).contains("attach_fixture"))
        assertTrue(chatProbeActions(hasFixture = true).contains("attach_fixture"))
    }

    @Test
    fun attachFixtureIsRefusedUnlessTheControlPlaneIsEnabled() {
        val host = FakeChatProbeHost(stateWithSession(), picks = listOf(fixturePick()))
        val probe = ChatProbe(host)

        // Probe.enabled is false outside the debug initializer, so the seam is inert.
        assertFalse(probe.perform("attach_fixture", emptyMap()))
        assertTrue(host.attached.isEmpty())
    }

    @Test
    fun tagNamesMatchTheStringsTheScreensApply() {
        assertEquals("session_menu_row_cat|1", sessionMenuRowTag("cat|1"))
        assertEquals(
            "elicitation_option_cat_mode_settings_toggle",
            elicitationOptionTag("cat_mode", "settings_toggle"),
        )
    }
}

private class FakeChatProbeHost(
    initialState: ChatUiState,
    private val picks: List<AttachmentPick>? = null,
) : ChatProbeHost {
    private var current: ChatUiState = initialState
    val calls = mutableListOf<String>()
    val attached = mutableListOf<List<AttachmentPick>>()

    override fun state(): ChatUiState = current

    override fun showSessionMenu() {
        current = current.copy(pickerVisible = true)
        calls += "showSessionMenu"
    }

    override fun hideSessionMenu() {
        current = current.copy(pickerVisible = false)
        calls += "hideSessionMenu"
    }

    override fun selectSession(row: SessionRow) {
        calls += "selectSession:${row.id}"
    }

    override fun newSession() {
        calls += "newSession"
    }

    override fun seeAllSessions() {
        calls += "seeAllSessions"
    }

    override fun setMode(value: String) {
        calls += "setMode:$value"
    }

    override fun setComposerText(text: String) {
        current = current.copy(composerText = text)
        calls += "setComposerText:$text"
    }

    override fun sendPrompt() {
        calls += "sendPrompt"
    }

    override fun cancelRun() {
        calls += "cancelRun"
    }

    override fun removeAttachment(localId: String) {
        calls += "removeAttachment:$localId"
    }

    override fun openElicitation() {
        calls += "openElicitation"
    }

    override fun closeElicitation() {
        calls += "closeElicitation"
    }

    override fun selectElicitationOption(questionKey: String, optionValue: String) {
        calls += "selectElicitationOption:$questionKey=$optionValue"
    }

    override fun submitElicitation() {
        calls += "submitElicitation"
    }

    override fun declineElicitation() {
        calls += "declineElicitation"
    }

    override fun openChanges() {
        calls += "openChanges"
    }

    override fun dismissKeyboard() {
        calls += "dismissKeyboard"
    }

    override fun back() {
        calls += "back"
    }

    override fun fixturePicks(): List<AttachmentPick>? = picks

    override fun attachPicks(picks: List<AttachmentPick>) {
        attached += picks
    }
}

private fun sessionRow() = SessionRow(
    sessionId = "s1",
    name = "Cat screensaver",
    cwd = "/work/cat-screensaver",
    workspaceId = "cat-screensaver",
    workspaceLabel = "cat-screensaver",
    agentId = "opencode",
    agentLabel = "OpenCode",
    state = SessionState.Idle,
    updatedAt = "2026-01-01T00:00:00Z",
)

private fun composerConfig() = ComposerConfigUi(
    model = SelectOption(
        id = "model",
        name = "Model",
        currentValue = "claude-sonnet-4-5",
        options = listOf(
            ConfigOptionValue(value = "claude-sonnet-4-5", name = "Claude Sonnet 4.5"),
        ),
    ),
    mode = SelectOption(
        id = "mode",
        name = "Mode",
        currentValue = "plan",
        options = listOf(
            ConfigOptionValue(value = "agent", name = "Agent"),
            ConfigOptionValue(value = "plan", name = "Plan"),
            ConfigOptionValue(value = "build", name = "Build"),
        ),
    ),
)

private fun stateWithSession() = ChatUiState(
    selectedSession = sessionRow(),
    composerText = "Read the spec",
    composerConfig = composerConfig(),
    changesBadgeCount = 3,
    pendingAttachments = listOf(
        PendingAttachmentUi(
            localId = "att_1",
            name = "mia.jpg",
            size = 4,
            kind = AttachmentKind.Image,
            mimeType = "image/jpeg",
            bytes = byteArrayOf(1, 2, 3, 4),
        ),
        PendingAttachmentUi(
            localId = "att_2",
            name = "cat-mode.md",
            size = 4,
            kind = AttachmentKind.File,
            mimeType = "text/markdown",
            bytes = byteArrayOf(5, 6, 7, 8),
        ),
    ),
    transcript = AcpTranscriptState(
        rows = listOf(
            TranscriptUserRow(turnId = "t1", text = "Plan it"),
            TranscriptAssistantRow(turnId = "t1", text = "All done."),
        ),
        sessionState = SessionState.Idle,
        usage = ContextUsage(
            used = 84_200,
            size = 200_000,
            cost = UsageCost(amount = 0.045, currency = "USD"),
        ),
    ),
)

private fun fixturePick() = AttachmentPick(
    name = "mia.jpg",
    mimeType = "image/jpeg",
    bytes = byteArrayOf(1, 2, 3),
)
