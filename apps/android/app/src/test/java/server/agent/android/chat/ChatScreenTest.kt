package server.agent.android.chat

import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import server.agent.android.chat.composer.ComposerConfigActions
import server.agent.android.chat.composer.ComposerConfigUi
import server.agent.android.chat.composer.completeSlashCommand
import server.agent.android.ui.promptinput.applyEdit
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.AvailableCommand
import server.agent.android.contracts.ConfigOptionValue
import server.agent.android.contracts.PermissionOption
import server.agent.android.contracts.PermissionOptionKind
import server.agent.android.contracts.PermissionRequest
import server.agent.android.contracts.PermissionStatus
import server.agent.android.contracts.SelectOption
import server.agent.android.contracts.SessionState
import server.agent.android.ui.theme.AgentServerTheme

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
            AgentServerTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/agent-server",
                            workspaceId = "ws_01",
                            workspaceLabel = "agent-server",
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
    fun showsTranscriptAndSubmitsFollowUpPrompt() {
        var submitted = false
        val composerState = TextFieldState()
        val uiState by mutableStateOf(
            ChatUiState(
                selectedSession = SessionRow(
                    sessionId = "sess_01",
                    name = "Alpha",
                    cwd = "/tmp/agent-server",
                    workspaceId = "ws_01",
                    workspaceLabel = "agent-server",
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
            AgentServerTheme(dynamicColor = false) {
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
            AgentServerTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/agent-server",
                            workspaceId = "ws_01",
                            workspaceLabel = "agent-server",
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
            AgentServerTheme(dynamicColor = false) {
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
    fun overflowMenuNoLongerOffersNewSession() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/agent-server",
                            workspaceId = "ws_01",
                            workspaceLabel = "agent-server",
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
            AgentServerTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/agent-server",
                            workspaceId = "ws_01",
                            workspaceLabel = "agent-server",
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
            AgentServerTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/agent-server",
                            workspaceId = "ws_01",
                            workspaceLabel = "agent-server",
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
            AgentServerTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/agent-server",
                            workspaceId = "ws_01",
                            workspaceLabel = "agent-server",
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
                    cwd = "/tmp/agent-server",
                    workspaceId = "ws_01",
                    workspaceLabel = "agent-server",
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
            AgentServerTheme(dynamicColor = false) {
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
                    cwd = "/tmp/agent-server",
                    workspaceId = "ws_01",
                    workspaceLabel = "agent-server",
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
            AgentServerTheme(dynamicColor = false) {
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
            AgentServerTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/agent-server",
                            workspaceId = "ws_01",
                            workspaceLabel = "agent-server",
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
            AgentServerTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/agent-server",
                            workspaceId = "ws_01",
                            workspaceLabel = "agent-server",
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
            AgentServerTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/agent-server",
                            workspaceId = "ws_01",
                            workspaceLabel = "agent-server",
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
                    cwd = "/tmp/agent-server",
                    workspaceId = "ws_01",
                    workspaceLabel = "agent-server",
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
            AgentServerTheme(dynamicColor = false) {
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
                    cwd = "/tmp/agent-server",
                    workspaceId = "ws_01",
                    workspaceLabel = "agent-server",
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
            AgentServerTheme(dynamicColor = false) {
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
                    cwd = "/tmp/agent-server",
                    workspaceId = "ws_01",
                    workspaceLabel = "agent-server",
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
            AgentServerTheme(dynamicColor = false) {
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
}
