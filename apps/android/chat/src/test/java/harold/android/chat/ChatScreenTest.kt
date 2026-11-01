package harold.android.chat

import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextInput
import harold.android.chat.composer.ComposerConfigActions
import harold.android.chat.composer.ComposerConfigUi
import harold.android.chat.composer.completeSlashCommand
import harold.android.contracts.AgentId
import harold.android.contracts.AvailableCommand
import harold.android.contracts.ConfigOptionValue
import harold.android.contracts.PermissionOption
import harold.android.contracts.PermissionOptionKind
import harold.android.contracts.PermissionRequest
import harold.android.contracts.PermissionStatus
import harold.android.contracts.SelectOption
import harold.android.contracts.SessionState
import harold.android.live.AcpTranscriptState
import harold.android.live.Elicitation
import harold.android.live.ElicitationKind
import harold.android.live.ElicitationOption
import harold.android.live.ElicitationQuestion
import harold.android.live.TranscriptAssistantRow
import harold.android.live.TranscriptUserRow
import harold.android.live.toContent
import harold.android.ui.promptinput.applyEdit
import harold.android.ui.theme.HaroldTheme
import harold.android.voice.VoiceDictationPresentation
import harold.android.voice.VoiceDictationUiState
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class ChatScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun rendersComposerConfigChipsAndForwardsModeCycle() {
        var cycled: ConfigOptionValue? = null
        val composerState = TextFieldState()
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/harold",
                            workspaceId = "ws_01",
                            workspaceLabel = "harold",
                            agentId = "cursor",
                            agentLabel = "Cursor",
                            state = SessionState.Idle,
                            updatedAt = "2026-08-05T01:00:00.000Z",
                        ),
                        composerConfig = ComposerConfigUi(
                            model = SelectOption(
                                id = "model",
                                name = "Model",
                                category = "model",
                                currentValue = "opus",
                                options = listOf(
                                    ConfigOptionValue(value = "opus", name = "Claude Opus 4.5"),
                                ),
                            ),
                            mode = SelectOption(
                                id = "mode",
                                name = "Mode",
                                category = "mode",
                                currentValue = "agent",
                                options = listOf(
                                    ConfigOptionValue(value = "agent", name = "Agent"),
                                    ConfigOptionValue(value = "plan", name = "Plan"),
                                ),
                            ),
                        ),
                    ),
                    composerState = composerState,
                    composerActions = ComposerConfigActions(onModeCycle = { cycled = it }),
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Claude Opus 4.5").assertIsDisplayed()
        composeTestRule.onNodeWithTag("composer_config_mode_chip").performClick()

        assertEquals("plan", cycled?.value)
    }

    @Test
    fun reconnectBannerHidesTheBlockedComposerMessage() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/harold",
                            workspaceId = "ws_01",
                            workspaceLabel = "harold",
                            agentId = "cursor",
                            agentLabel = "Cursor",
                            state = SessionState.Offline,
                            updatedAt = "2026-08-05T01:00:00.000Z",
                        ),
                        transcript = AcpTranscriptState(sessionState = SessionState.Offline),
                        streamReconnecting = true,
                    ),
                    composerState = TextFieldState(),
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("stream_reconnect_banner").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("composer_blocked_message").assertCountEquals(0)
    }

    @Test
    fun showsTranscriptAndSubmitsFollowUpPrompt() {
        var submitted = false
        val composerState = TextFieldState()
        val uiState by mutableStateOf(
            ChatUiState(
                selectedSession = SessionRow(
                    sessionId = "sess_01",
                    name = "Alpha",
                    cwd = "/tmp/harold",
                    workspaceId = "ws_01",
                    workspaceLabel = "harold",
                    agentId = "cursor",
                    agentLabel = "Cursor",
                    state = SessionState.Idle,
                    updatedAt = "2026-08-05T01:00:00.000Z",
                ),
                transcript = AcpTranscriptState(
                    rows = listOf(
                        TranscriptUserRow(
                            turnId = "turn_01",
                            text = "Explain auth",
                        ),
                        TranscriptAssistantRow(
                            turnId = "turn_01",
                            text = "Auth uses bearer tokens.",
                        ),
                    ),
                    sessionState = SessionState.Idle,
                ),
            ),
        )

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = uiState,
                    composerState = composerState,
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerSubmit = { submitted = true },
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Explain auth").assertIsDisplayed()
        composeTestRule.onNodeWithText("Auth uses bearer tokens.").assertIsDisplayed()
        composeTestRule.onNodeWithTag("chat_composer")
            .assertIsEnabled()
            .performTextInput("Follow up")
        composeTestRule.onNodeWithTag("chat_send_button").performClick()

        assertTrue(submitted)
        assertTrue(composerState.text.toString() == "Follow up")
    }

    @Test
    fun disablesComposerWhileSessionRunningAndShowsCancel() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/harold",
                            workspaceId = "ws_01",
                            workspaceLabel = "harold",
                            agentId = "cursor",
                            agentLabel = "Cursor",
                            state = SessionState.Running,
                            updatedAt = "2026-08-05T01:00:00.000Z",
                        ),
                        transcript = AcpTranscriptState(sessionState = SessionState.Running),
                    ),
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerTextChanged = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("chat_composer").assertIsNotEnabled()
        composeTestRule.onNodeWithTag("activity_status_line").assertIsDisplayed()
        composeTestRule
            .onNodeWithTag("thinking_indicator", useUnmergedTree = true)
            .assertIsDisplayed()
        composeTestRule.onNodeWithTag("chat_cancel_button").assertIsDisplayed()
    }

    @Test
    fun showsSelectSessionCtaWhenNoSessionSelected() {
        var createClicked = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(selectedSession = null),
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = { createClicked = true },
                    onComposerTextChanged = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("select_session_cta").assertIsDisplayed()
        composeTestRule.onNodeWithTag("chat_welcome").assertIsDisplayed()
        composeTestRule.onNodeWithText("Chat with an agent").assertIsDisplayed()
        composeTestRule.onNodeWithText("Start a new session or pick an existing one.").assertIsDisplayed()
        composeTestRule.onNodeWithTag("session_selector").assertIsDisplayed()
        composeTestRule.onNodeWithTag("new_session_cta").assertIsDisplayed().performClick()
        assertTrue(createClicked)
    }

    @Test
    fun showsSelectSessionCtaWhileSessionsAreRefreshing() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = null,
                        isRefreshing = true,
                    ),
                )
            }
        }

        composeTestRule.onNodeWithTag("select_session_cta").assertIsDisplayed()
        composeTestRule.onNodeWithTag("chat_welcome").assertIsDisplayed()
        composeTestRule.onNodeWithTag("select_session_refreshing").assertIsDisplayed()
    }

    @Test
    fun overflowMenuNoLongerOffersNewSession() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/harold",
                            workspaceId = "ws_01",
                            workspaceLabel = "harold",
                            agentId = "cursor",
                            agentLabel = "Cursor",
                            state = SessionState.Idle,
                            updatedAt = "2026-08-05T01:00:00.000Z",
                        ),
                    ),
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerTextChanged = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("chat_overflow").performClick()
        composeTestRule.onAllNodesWithTag("new_session_menu_item").assertCountEquals(0)
        composeTestRule.onNodeWithTag("workspaces_menu_item").assertIsDisplayed()
    }

    @Test
    fun showsWelcomeWhenSelectedSessionHasEmptyTranscript() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/harold",
                            workspaceId = "ws_01",
                            workspaceLabel = "harold",
                            agentId = "cursor",
                            agentLabel = "Cursor",
                            state = SessionState.Idle,
                            updatedAt = "2026-08-05T01:00:00.000Z",
                        ),
                    ),
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerTextChanged = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("chat_welcome").assertIsDisplayed()
        composeTestRule.onNodeWithText("Chat with an agent").assertIsDisplayed()
        composeTestRule.onNodeWithText(
            "Send a prompt directly to an agent without leaving the console.",
        ).assertIsDisplayed()
        composeTestRule.onNodeWithTag("chat_composer").assertIsDisplayed()
    }

    @Test
    fun showsPermissionPanelAboveComposer() {
        var selectedOption: String? = null
        val request = PermissionRequest(
            id = "perm_01",
            sessionId = "sess_01",
            turnId = "turn_01",
            toolCallId = "tool_01",
            toolName = "fake-tool",
            status = PermissionStatus.Pending,
            options = listOf(
                PermissionOption("allow-once", "Allow once", PermissionOptionKind.Allow),
                PermissionOption("reject-once", "Reject once", PermissionOptionKind.Deny),
            ),
            createdAt = "2026-08-06T00:00:00.000Z",
        )

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/harold",
                            workspaceId = "ws_01",
                            workspaceLabel = "harold",
                            agentId = "cursor",
                            agentLabel = "Cursor",
                            state = SessionState.AwaitingPermission,
                            updatedAt = "2026-08-05T01:00:00.000Z",
                        ),
                        pendingPermissions = listOf(request),
                    ),
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerTextChanged = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = { optionId -> selectedOption = optionId },
                )
            }
        }

        composeTestRule.onNodeWithTag("permission_panel").assertIsDisplayed()
        composeTestRule.onNodeWithText("Permission required for fake-tool").assertIsDisplayed()
        composeTestRule.onNodeWithText("Session: Alpha").assertIsDisplayed()
        composeTestRule.onNodeWithTag("permission_option_allow-once").performClick()
        assertTrue(selectedOption == "allow-once")
    }

    @Test
    fun showsIconOverflowWithoutMoreText() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/harold",
                            workspaceId = "ws_01",
                            workspaceLabel = "harold",
                            agentId = "cursor",
                            agentLabel = "Cursor",
                            state = SessionState.Idle,
                            updatedAt = "2026-08-05T01:00:00.000Z",
                        ),
                    ),
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerTextChanged = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("chat_overflow").assertIsDisplayed()
        composeTestRule.onAllNodesWithText("More").assertCountEquals(0)
        composeTestRule.onNodeWithTag("session_selector").assertIsDisplayed()
    }

    @Test
    fun sendIsIconButtonAndSlashOpensCommandList() {
        val composerState = TextFieldState()
        val uiState by mutableStateOf(
            ChatUiState(
                selectedSession = SessionRow(
                    sessionId = "sess_01",
                    name = "Alpha",
                    cwd = "/tmp/harold",
                    workspaceId = "ws_01",
                    workspaceLabel = "harold",
                    agentId = "cursor",
                    agentLabel = "Cursor",
                    state = SessionState.Idle,
                    updatedAt = "2026-08-05T01:00:00.000Z",
                ),
                availableCommands = listOf(
                    AvailableCommand(name = "plan", description = "Draft a plan"),
                    AvailableCommand(name = "review", description = "Review changes"),
                ),
            ),
        )

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = uiState,
                    composerState = composerState,
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                    onComposerCommandPick = { name ->
                        composerState.applyEdit(
                            completeSlashCommand(
                                composerText = composerState.text.toString(),
                                selection = composerState.selection,
                                commandName = name,
                            ),
                        )
                    },
                )
            }
        }

        composeTestRule.onNodeWithTag("chat_send_button").assertIsDisplayed()
        composeTestRule.onAllNodesWithText("Send").assertCountEquals(0)
        composeTestRule.onNodeWithTag("chat_composer").performTextInput("/")
        composeTestRule.onNodeWithTag("command_list_panel").assertIsDisplayed()
        composeTestRule.onNodeWithTag("command_list_item_plan").assertIsDisplayed().performClick()
        assertTrue(composerState.text.toString() == "/plan ")
        composeTestRule.onAllNodesWithTag("command_list_panel").assertCountEquals(0)
    }

    @Test
    fun slashRailButtonInsertsShortcutAndFilteringNarrowsList() {
        val composerState = TextFieldState()
        val uiState by mutableStateOf(
            ChatUiState(
                selectedSession = SessionRow(
                    sessionId = "sess_01",
                    name = "Alpha",
                    cwd = "/tmp/harold",
                    workspaceId = "ws_01",
                    workspaceLabel = "harold",
                    agentId = "cursor",
                    agentLabel = "Cursor",
                    state = SessionState.Idle,
                    updatedAt = "2026-08-05T01:00:00.000Z",
                ),
                availableCommands = listOf(
                    AvailableCommand(name = "plan", description = "Draft a plan"),
                    AvailableCommand(name = "review", description = "Review changes"),
                ),
            ),
        )

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = uiState,
                    composerState = composerState,
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerTextChanged = { text ->
                        composerState.setTextAndPlaceCursorAtEnd(text)
                    },
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("chat_command_button").assertIsDisplayed().performClick()
        assertTrue(composerState.text.toString() == "/")
        composeTestRule.onNodeWithTag("command_list_panel").assertIsDisplayed()

        // A typed query narrows the list.
        composerState.setTextAndPlaceCursorAtEnd("/rev")
        composeTestRule.onNodeWithTag("command_list_item_review").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("command_list_item_plan").assertCountEquals(0)

        // Deleting the slash closes the panel.
        composerState.setTextAndPlaceCursorAtEnd("")
        composeTestRule.onAllNodesWithTag("command_list_panel").assertCountEquals(0)
    }

    @Test
    fun micVisibleAndEnabledWhenSessionSelectedAndComposerEnabled() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/harold",
                            workspaceId = "ws_01",
                            workspaceLabel = "harold",
                            agentId = "cursor",
                            agentLabel = "Cursor",
                            state = SessionState.Idle,
                            updatedAt = "2026-08-05T01:00:00.000Z",
                        ),
                        voiceDictation = VoiceDictationUiState(recognizerAvailable = true),
                    ),
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerTextChanged = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("chat_voice_mic_button")
            .assertIsDisplayed()
            .assertIsEnabled()
    }

    @Test
    fun micDisabledWhenComposerDisabled() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/harold",
                            workspaceId = "ws_01",
                            workspaceLabel = "harold",
                            agentId = "cursor",
                            agentLabel = "Cursor",
                            state = SessionState.Running,
                            updatedAt = "2026-08-05T01:00:00.000Z",
                        ),
                        transcript = AcpTranscriptState(sessionState = SessionState.Running),
                        voiceDictation = VoiceDictationUiState(recognizerAvailable = true),
                    ),
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerTextChanged = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("chat_voice_mic_button")
            .assertIsDisplayed()
            .assertIsNotEnabled()
    }

    @Test
    fun micDisabledWhenRecognizerUnavailable() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/harold",
                            workspaceId = "ws_01",
                            workspaceLabel = "harold",
                            agentId = "cursor",
                            agentLabel = "Cursor",
                            state = SessionState.Idle,
                            updatedAt = "2026-08-05T01:00:00.000Z",
                        ),
                        voiceDictation = VoiceDictationUiState(recognizerAvailable = false),
                    ),
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerTextChanged = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("chat_voice_mic_button")
            .assertIsDisplayed()
            .assertIsNotEnabled()
    }

    @Test
    fun micOpensInlineVoiceModeAndExpandShowsOverlay() {
        var openCalls = 0
        var expandCalls = 0
        var uiState by mutableStateOf(
            ChatUiState(
                selectedSession = SessionRow(
                    sessionId = "sess_01",
                    name = "Alpha",
                    cwd = "/tmp/harold",
                    workspaceId = "ws_01",
                    workspaceLabel = "harold",
                    agentId = "cursor",
                    agentLabel = "Cursor",
                    state = SessionState.Idle,
                    updatedAt = "2026-08-05T01:00:00.000Z",
                ),
                composerText = "Draft prompt",
                voiceDictation = VoiceDictationUiState(recognizerAvailable = true),
            ),
        )

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = uiState,
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerTextChanged = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                    onVoiceDictationOpen = { _ ->
                        openCalls += 1
                        uiState = uiState.copy(
                            voiceDictation = VoiceDictationUiState(
                                visible = true,
                                transcript = "Draft prompt",
                                isListening = false,
                                recognizerAvailable = true,
                            ),
                        )
                    },
                    onVoiceDictationExpand = {
                        expandCalls += 1
                        uiState = uiState.copy(
                            voiceDictation = uiState.voiceDictation.copy(
                                presentation = VoiceDictationPresentation.Expanded,
                            ),
                        )
                    },
                )
            }
        }

        composeTestRule.onAllNodesWithTag("voice_inline_slot").assertCountEquals(0)
        composeTestRule.onNodeWithTag("chat_voice_mic_button").performClick()
        assertTrue(openCalls == 1)

        composeTestRule.onNodeWithTag("voice_inline_slot").assertIsDisplayed()
        composeTestRule.onNodeWithTag("voice_inline_transcript").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("voice_dictation_overlay").assertCountEquals(0)

        composeTestRule.onNodeWithTag("voice_expand_button").performClick()
        assertTrue(expandCalls == 1)
        composeTestRule.onNodeWithTag("voice_dictation_overlay").assertIsDisplayed()
    }

    @Test
    fun voiceKeyboardButtonAppliesTranscriptViaCallback() {
        var confirmCalls = 0
        var uiState by mutableStateOf(
            ChatUiState(
                selectedSession = SessionRow(
                    sessionId = "sess_01",
                    name = "Alpha",
                    cwd = "/tmp/harold",
                    workspaceId = "ws_01",
                    workspaceLabel = "harold",
                    agentId = "cursor",
                    agentLabel = "Cursor",
                    state = SessionState.Idle,
                    updatedAt = "2026-08-05T01:00:00.000Z",
                ),
                composerText = "Draft",
                voiceDictation = VoiceDictationUiState(
                    visible = true,
                    transcript = "Draft hello world",
                    isListening = false,
                    recognizerAvailable = true,
                ),
            ),
        )

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = uiState,
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerTextChanged = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                    onVoiceDictationConfirm = {
                        confirmCalls += 1
                        uiState = uiState.copy(
                            composerText = "Draft hello world",
                            voiceDictation = VoiceDictationUiState(recognizerAvailable = true),
                        )
                    },
                )
            }
        }

        composeTestRule.onNodeWithTag("voice_inline_slot").assertIsDisplayed()
        composeTestRule.onNodeWithTag("voice_keyboard_button").performClick()
        assertTrue(confirmCalls == 1)
        assertTrue(uiState.composerText == "Draft hello world")
        composeTestRule.onAllNodesWithTag("voice_inline_slot").assertCountEquals(0)
        composeTestRule.onNodeWithTag("chat_composer").assertIsDisplayed()
    }

    @Test
    fun voiceCommandButtonOpensListAndPickSetsPrefix() {
        var picked: String? = null
        var uiState by mutableStateOf(
            ChatUiState(
                selectedSession = SessionRow(
                    sessionId = "sess_01",
                    name = "Alpha",
                    cwd = "/tmp/harold",
                    workspaceId = "ws_01",
                    workspaceLabel = "harold",
                    agentId = "cursor",
                    agentLabel = "Cursor",
                    state = SessionState.Idle,
                    updatedAt = "2026-08-05T01:00:00.000Z",
                ),
                availableCommands = listOf(
                    AvailableCommand(name = "plan", description = "Draft a plan"),
                ),
                voiceDictation = VoiceDictationUiState(
                    visible = true,
                    transcript = "make it fast",
                    isListening = false,
                    recognizerAvailable = true,
                ),
            ),
        )

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = uiState,
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerTextChanged = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                    onVoiceCommandToggle = {
                        uiState = uiState.copy(
                            voiceCommandListVisible = !uiState.voiceCommandListVisible,
                        )
                    },
                    onVoiceCommandPick = { name ->
                        picked = name
                        uiState = uiState.copy(
                            voiceCommandPrefix = "/$name ",
                            voiceCommandListVisible = false,
                        )
                    },
                )
            }
        }

        composeTestRule.onAllNodesWithTag("command_list_panel").assertCountEquals(0)
        composeTestRule.onNodeWithTag("voice_command_button").performClick()
        composeTestRule.onNodeWithTag("command_list_panel").assertIsDisplayed()
        composeTestRule.onNodeWithTag("command_list_item_plan").performClick()
        assertTrue(picked == "plan")
        composeTestRule.onAllNodesWithTag("command_list_panel").assertCountEquals(0)
        composeTestRule.onNodeWithText("/plan make it fast").assertIsDisplayed()
    }

    @Test
    fun elicitationCardShowsFirstQuestionAndOpensSheet() {
        var opened = false
        val request = form(
            question(
                key = "color",
                title = "Favorite color",
                kind = ElicitationKind.SingleSelect(
                    listOf(
                        ElicitationOption("red", "Red"),
                        ElicitationOption("blue", "Blue"),
                    ),
                ),
                required = true,
            ),
            question(
                key = "notify",
                title = "Notify me",
                kind = ElicitationKind.BooleanField,
            ),
        )
        var uiState by mutableStateOf(
            ChatUiState(
                selectedSession = elicitationSession(),
                pendingElicitations = listOf(request),
            ),
        )

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = uiState,
                    onElicitationOpen = {
                        opened = true
                        uiState = uiState.copy(
                            elicitationUiState = uiState.elicitationUiState.copy(showSheet = true),
                        )
                    },
                    onElicitationNext = {
                        uiState = uiState.copy(
                            elicitationUiState = uiState.elicitationUiState.copy(stepIndex = 1),
                        )
                    },
                )
            }
        }

        composeTestRule.onNodeWithTag("elicitation_card").assertIsDisplayed()
        composeTestRule.onNodeWithTag("elicitation_card_title")
            .assertTextContains("Favorite color", substring = true)
        composeTestRule.onNodeWithTag("elicitation_card_more")
            .assertTextContains("+1 more", substring = true)
        composeTestRule.onNodeWithText("Cursor").assertDoesNotExist()
        composeTestRule.onNodeWithTag("elicitation_answer_button").performClick()

        assertTrue(opened)
        composeTestRule.onNodeWithTag("elicitation_sheet").assertIsDisplayed()
        composeTestRule.onNodeWithTag("elicitation_question_counter")
            .assertTextEquals("Question 1 of 2")
        composeTestRule.onNodeWithTag("elicitation_progress").assertIsDisplayed()
        composeTestRule.onNodeWithText("Questions").assertDoesNotExist()
        composeTestRule.onAllNodesWithTag("elicitation_step_0").assertCountEquals(0)
        composeTestRule.onNodeWithTag("elicitation_question_title")
            .assertTextContains("Favorite color", substring = true)

        composeTestRule.onNodeWithTag("elicitation_next").performClick()

        composeTestRule.onNodeWithTag("elicitation_question_counter")
            .assertTextEquals("Question 2 of 2")
        composeTestRule.onNodeWithTag("elicitation_question_title")
            .assertTextContains("Notify me", substring = true)
    }

    @Test
    fun singleQuestionCardCentersTitleWithAnswerButton() {
        val request = form(
            question(
                key = "color",
                title = "Favorite color",
                kind = ElicitationKind.SingleSelect(
                    listOf(ElicitationOption("red", "Red")),
                ),
                required = true,
            ),
        )

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = elicitationSession(),
                        pendingElicitations = listOf(request),
                    ),
                )
            }
        }

        composeTestRule.onNodeWithTag("elicitation_card").assertIsDisplayed()
        val titleBounds = composeTestRule.onNodeWithTag("elicitation_card_title")
            .fetchSemanticsNode().boundsInRoot
        val answerBounds = composeTestRule.onNodeWithTag("elicitation_answer_button")
            .fetchSemanticsNode().boundsInRoot
        assertEquals(titleBounds.center.y, answerBounds.center.y, 1f)
    }

    @Test
    fun singleSelectSubmitStaysDisabledUntilRequiredAnswerExists() {
        val request = form(
            question(
                key = "color",
                title = "Favorite color",
                kind = ElicitationKind.SingleSelect(
                    listOf(
                        ElicitationOption("red", "Red"),
                        ElicitationOption("blue", "Blue"),
                    ),
                ),
                required = true,
            ),
        )
        var submitted = false
        var uiState by mutableStateOf(
            ChatUiState(
                selectedSession = elicitationSession(),
                pendingElicitations = listOf(request),
                elicitationUiState = ElicitationUiState(
                    requestId = request.requestId,
                    showSheet = true,
                ),
            ),
        )

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = uiState,
                    onElicitationSingleSelected = { key, value ->
                        uiState = uiState.copy(
                            elicitationUiState = uiState.elicitationUiState.copy(
                                draft = uiState.elicitationUiState.draft.withSingle(key, value),
                            ),
                        )
                    },
                    onElicitationSubmit = { submitted = true },
                )
            }
        }

        composeTestRule.onAllNodesWithTag("elicitation_question_counter").assertCountEquals(0)
        composeTestRule.onAllNodesWithTag("elicitation_progress").assertCountEquals(0)
        composeTestRule.onNodeWithText("Questions").assertDoesNotExist()
        composeTestRule.onNodeWithText("Question 1 of 1").assertDoesNotExist()
        composeTestRule.onNodeWithTag("elicitation_submit").assertIsNotEnabled()
        composeTestRule.onNodeWithTag("elicitation_option_color_blue").performClick()
        composeTestRule.onNodeWithTag("elicitation_submit").assertIsEnabled().performClick()

        assertTrue(submitted)
        assertEquals(
            "blue",
            uiState.elicitationUiState.draft.singleFor("color"),
        )
    }

    @Test
    fun multiSelectOtherSendsBaseValuesAndCustomText() {
        val request = form(
            question(
                key = "choices",
                title = "Pick two",
                kind = ElicitationKind.MultiSelect(
                    options = listOf(
                        ElicitationOption("a", "Option A"),
                        ElicitationOption("b", "Option B"),
                    ),
                    minItems = 2,
                ),
                required = true,
                otherKey = "choices_custom",
            ),
        )
        var submitted = false
        var uiState by mutableStateOf(
            ChatUiState(
                selectedSession = elicitationSession(),
                pendingElicitations = listOf(request),
                elicitationUiState = ElicitationUiState(
                    requestId = request.requestId,
                    showSheet = true,
                ),
            ),
        )

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = uiState,
                    onElicitationMultiToggled = { key, value ->
                        uiState = uiState.copy(
                            elicitationUiState = uiState.elicitationUiState.copy(
                                draft = uiState.elicitationUiState.draft.toggleMulti(key, value),
                            ),
                        )
                    },
                    onElicitationOtherToggled = { key, selected ->
                        uiState = uiState.copy(
                            elicitationUiState = uiState.elicitationUiState.copy(
                                draft = uiState.elicitationUiState.draft
                                    .withOtherSelected(key, selected),
                            ),
                        )
                    },
                    onElicitationOtherTextChanged = { key, text ->
                        uiState = uiState.copy(
                            elicitationUiState = uiState.elicitationUiState.copy(
                                draft = uiState.elicitationUiState.draft.withOtherText(key, text),
                            ),
                        )
                    },
                    onElicitationSubmit = { submitted = true },
                )
            }
        }

        composeTestRule.onNodeWithTag("elicitation_option_choices_a").performClick()
        composeTestRule.onNodeWithTag("elicitation_other_toggle_choices").performClick()
        composeTestRule.onNodeWithTag("elicitation_submit").assertIsNotEnabled()
        composeTestRule.onNodeWithTag("elicitation_other_text_choices")
            .performTextInput("Custom")
        composeTestRule.onNodeWithTag("elicitation_submit")
            .assertIsEnabled()
            .performSemanticsAction(SemanticsActions.OnClick)
        composeTestRule.waitForIdle()

        assertTrue(
            "draft=${uiState.elicitationUiState.draft}",
            submitted,
        )
        assertEquals(
            """{"choices":["a"],"choices_custom":"Custom"}""",
            uiState.elicitationUiState.draft.toContent(listOf(request.questions.first())).toString(),
        )
    }

    @Test
    fun closingAndReopeningTheSheetKeepsTheDraft() {
        val request = form(
            question(
                key = "note",
                title = "Add a note",
                kind = ElicitationKind.Text(),
                required = false,
            ),
        )
        var uiState by mutableStateOf(
            ChatUiState(
                selectedSession = elicitationSession(),
                pendingElicitations = listOf(request),
                elicitationUiState = ElicitationUiState(
                    requestId = request.requestId,
                    showSheet = true,
                    draft = harold.android.live.ElicitationDraft().withText("note", "Existing"),
                ),
            ),
        )

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = uiState,
                    onElicitationOpen = {
                        uiState = uiState.copy(
                            elicitationUiState = uiState.elicitationUiState.copy(showSheet = true),
                        )
                    },
                    onElicitationClose = {
                        uiState = uiState.copy(
                            elicitationUiState = uiState.elicitationUiState.copy(showSheet = false),
                        )
                    },
                )
            }
        }

        composeTestRule.onNodeWithTag("elicitation_sheet_close").performClick()
        composeTestRule.onAllNodesWithTag("elicitation_sheet").assertCountEquals(0)
        composeTestRule.onNodeWithTag("elicitation_answer_button").performClick()

        composeTestRule.onNodeWithTag("elicitation_sheet").assertIsDisplayed()
        composeTestRule.onNodeWithTag("elicitation_field_note")
            .assertTextContains("Existing", substring = true)
    }

    @Test
    fun urlSheetShowsFullUrlHostAndInsecureWarning() {
        val request = Elicitation.Url(
            requestId = "req_url",
            agentId = "cursor",
            sessionId = "sess_01",
            message = "Sign in to continue",
            raw = JsonObject(emptyMap()),
            elicitationId = "elicit_01",
            url = "http://example.com/login?code=1",
            host = "example.com",
        )
        var opened = false

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ElicitationSheet(
                    state = ElicitationUiState(requestId = request.requestId, showSheet = true),
                    request = request,
                    agentName = "Cursor",
                    onClose = {},
                    onRawToggle = {},
                    onTextChanged = { _, _ -> },
                    onSingleSelected = { _, _ -> },
                    onMultiToggled = { _, _ -> },
                    onBooleanChanged = { _, _ -> },
                    onOtherToggled = { _, _ -> },
                    onOtherTextChanged = { _, _ -> },
                    onBack = {},
                    onNext = {},
                    onEditStep = {},
                    onSubmit = {},
                    onDecline = {},
                    onCancel = {},
                    onOpenUrl = { opened = true },
                )
            }
        }

        composeTestRule.onNodeWithTag("elicitation_url").assertIsDisplayed()
        composeTestRule.onNodeWithTag("elicitation_url_full")
            .assertTextContains("http://example.com/login?code=1", substring = true)
        composeTestRule.onNodeWithTag("elicitation_url_host")
            .assertTextContains("example.com", substring = true)
        composeTestRule.onNodeWithText("This link is not HTTPS.").assertIsDisplayed()
        composeTestRule.onNodeWithTag("elicitation_open_link").performClick()

        assertTrue(opened)
    }

    @Test
    fun fallbackCardRevealsRawRequestOnlyAfterExpanding() {
        val request = Elicitation.Unsupported(
            requestId = "req_unknown",
            agentId = "cursor",
            sessionId = "sess_01",
            message = null,
            raw = JsonObject(mapOf("mode" to JsonPrimitive("mystery"))),
            reason = "unknown mode",
        )

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ElicitationFallbackCard(elicitation = request, onCancel = {})
            }
        }

        composeTestRule.onNodeWithTag("elicitation_fallback").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("elicitation_fallback_raw").assertCountEquals(0)
        composeTestRule.onNodeWithTag("elicitation_fallback_expand").performClick()

        composeTestRule.onNodeWithTag("elicitation_fallback_raw")
            .assertTextContains("mystery", substring = true)
    }

    @Test
    fun transcriptQuestionRowExpandsMultipleAnswers() {
        val row = harold.android.live.TranscriptQuestionRow(
            turnId = "turn_01",
            requestId = "req_01",
            title = "Agent question",
            answers = listOf(
                "Color" to "Blue",
                "Size" to "Large",
            ),
        )

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                TranscriptQuestionRowView(row = row)
            }
        }

        composeTestRule.onNodeWithTag("transcript_question_summary", useUnmergedTree = true)
            .assertTextEquals("Blue · Large")
        composeTestRule.onNodeWithTag("transcript_question_toggle", useUnmergedTree = true)
            .assertIsDisplayed()
        composeTestRule.onNodeWithTag("transcript_question").performClick()

        composeTestRule.onNodeWithTag("transcript_question_answer_0", useUnmergedTree = true)
            .assertTextEquals("Color: Blue")
        composeTestRule.onNodeWithTag("transcript_question_answer_1", useUnmergedTree = true)
            .assertTextEquals("Size: Large")
    }

    @Test
    fun transcriptQuestionRowStaysCompactForOneAnswer() {
        val row = harold.android.live.TranscriptQuestionRow(
            turnId = "turn_01",
            requestId = "req_01",
            title = "Agent question",
            answers = listOf("Continue" to "Yes"),
        )

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                TranscriptQuestionRowView(row = row)
            }
        }

        composeTestRule.onNodeWithTag("transcript_question_summary", useUnmergedTree = true)
            .assertTextEquals("Yes")
        composeTestRule.onAllNodesWithTag("transcript_question_toggle", useUnmergedTree = true)
            .assertCountEquals(0)
        composeTestRule.onAllNodesWithTag("transcript_question_answer_0", useUnmergedTree = true)
            .assertCountEquals(0)
    }

    @Test
    fun changesActionShowsBadgeAndForwardsClick() {
        var clicked = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(selectedSession = elicitationSession()),
                    changesAvailable = true,
                    changesBadgeCount = 3,
                    onChangesClick = { clicked = true },
                )
            }
        }

        composeTestRule.onNodeWithTag("chat_changes").assertIsDisplayed()
        composeTestRule.onNodeWithTag("chat_changes_badge", useUnmergedTree = true)
            .assertIsDisplayed()
        composeTestRule.onNodeWithTag("chat_changes").performClick()

        assertTrue(clicked)
    }

    @Test
    fun changesActionIsHiddenWhenTheSessionIsNotInAGitWorktree() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(selectedSession = elicitationSession()),
                    changesAvailable = false,
                )
            }
        }

        composeTestRule.onAllNodesWithTag("chat_changes").assertCountEquals(0)
    }

    private fun elicitationSession() = SessionRow(
        sessionId = "sess_01",
        name = "Alpha",
        cwd = "/tmp/harold",
        workspaceId = "ws_01",
        workspaceLabel = "harold",
        agentId = "cursor",
        agentLabel = "Cursor",
        state = SessionState.Idle,
        updatedAt = "2026-08-05T01:00:00.000Z",
    )

    private fun form(vararg questions: ElicitationQuestion) = Elicitation.Form(
        requestId = "req_01",
        agentId = "cursor",
        sessionId = "sess_01",
        message = "Questions",
        raw = JsonObject(emptyMap()),
        questions = questions.toList(),
    )

    private fun question(
        key: String,
        title: String,
        kind: ElicitationKind,
        required: Boolean = false,
        otherKey: String? = null,
    ) = ElicitationQuestion(
        key = key,
        title = title,
        description = null,
        required = required,
        kind = kind,
        otherKey = otherKey,
    )
}
