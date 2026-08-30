package server.agent.android.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import server.agent.android.contracts.ToolCallStatus
import server.agent.android.contracts.ToolKind
import server.agent.android.ui.theme.AgentServerTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class ChatTranscriptTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private fun toolRow(toolCallId: String, toolName: String) = TranscriptToolRow(
        turnId = "turn_1",
        toolCallId = toolCallId,
        toolName = toolName,
        toolKind = ToolKind.Execute,
        status = ToolCallStatus.Completed,
    )

    @Test
    fun showsThinkingStickyStatusWhileRunningBeforeAssistantOutput() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatTranscript(
                    rows = listOf(
                        TranscriptUserRow(turnId = "turn_1", text = "Explain auth"),
                    ),
                    isRunning = true,
                    showWelcome = false,
                )
            }
        }

        composeTestRule.onNodeWithTag("activity_status_line").assertIsDisplayed()
        composeTestRule
            .onNodeWithTag("thinking_indicator", useUnmergedTree = true)
            .assertIsDisplayed()
        composeTestRule.onNodeWithText("Thinking").assertIsDisplayed()
    }

    @Test
    fun keepsThinkingSectionStaticWhileStickyLineShowsThinking() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatTranscript(
                    rows = listOf(
                        TranscriptUserRow(turnId = "turn_1", text = "Explain auth"),
                        TranscriptThinkingRow(turnId = "turn_1", text = "planning"),
                    ),
                    isRunning = true,
                    showWelcome = false,
                )
            }
        }

        composeTestRule.onNodeWithTag("activity_status_line").assertIsDisplayed()
        composeTestRule.onNodeWithTag("thinking_section").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("thinking_section_body").assertCountEquals(0)
        composeTestRule.onAllNodesWithText("Thinking").assertCountEquals(2)
    }

    @Test
    fun rendersCompletedThinkingAsCollapsibleSection() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatTranscript(
                    rows = listOf(
                        TranscriptUserRow(turnId = "turn_1", text = "Explain auth"),
                        TranscriptThinkingRow(turnId = "turn_1", text = "planning"),
                        TranscriptAssistantRow(turnId = "turn_1", text = "Auth uses JWT"),
                    ),
                    isRunning = false,
                    showWelcome = false,
                )
            }
        }

        composeTestRule.onAllNodesWithTag("activity_status_line").assertCountEquals(0)
        composeTestRule.onAllNodesWithTag("thinking_indicator").assertCountEquals(0)
        composeTestRule.onNodeWithText("Thinking").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("thinking_section_body").assertCountEquals(0)

        composeTestRule.onNodeWithText("Thinking").performClick()
        composeTestRule.onNodeWithText("planning").assertIsDisplayed()
    }

    @Test
    fun showsTheFinalAssistantReplyOnACompletedTurn() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                Box(modifier = Modifier.height(320.dp)) {
                    ChatTranscript(
                        rows = listOf(
                            TranscriptUserRow(
                                turnId = "turn_1",
                                text = "Yes go ahead and add the reciprocal links to the doc, " +
                                    "then mirror them in the chrome-testing skill so agents " +
                                    "pick them up there too.",
                            ),
                            TranscriptThinkingRow(turnId = "turn_1", text = "planning the edit"),
                            toolRow("t1", "read"),
                            toolRow("t2", "grep"),
                            toolRow("t3", "edit"),
                            toolRow("t4", "read"),
                            toolRow("t5", "edit"),
                            toolRow("t6", "shell"),
                            TranscriptAssistantRow(
                                turnId = "turn_1",
                                text = "Added.",
                            ),
                        ),
                        isRunning = false,
                        showWelcome = false,
                    )
                }
            }
        }

        composeTestRule.onAllNodesWithTag("thinking_section_body").assertCountEquals(0)
        composeTestRule.onNodeWithText("Added.").assertIsDisplayed()
    }

    @Test
    fun keepsTheFinalAssistantReplyVisibleWhenTheTurnCompletes() {
        val turnRows = listOf(
            TranscriptUserRow(
                turnId = "turn_1",
                text = "Yes go ahead and add the reciprocal links to the doc, " +
                    "then mirror them in the chrome-testing skill so agents " +
                    "pick them up there too.",
            ),
            TranscriptThinkingRow(turnId = "turn_1", text = "planning the edit"),
            toolRow("t1", "read"),
            toolRow("t2", "grep"),
            toolRow("t3", "edit"),
            toolRow("t4", "read"),
            toolRow("t5", "edit"),
            toolRow("t6", "shell"),
        )
        var rows by mutableStateOf(turnRows)
        var running by mutableStateOf(true)

        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                Box(modifier = Modifier.height(320.dp)) {
                    ChatTranscript(
                        rows = rows,
                        isRunning = running,
                        showWelcome = false,
                    )
                }
            }
        }

        composeTestRule.runOnIdle {
            rows = turnRows + TranscriptAssistantRow(turnId = "turn_1", text = "Add")
        }
        composeTestRule.runOnIdle {
            rows = turnRows + TranscriptAssistantRow(turnId = "turn_1", text = "Added.")
        }
        composeTestRule.runOnIdle {
            running = false
        }

        composeTestRule.onNodeWithText("Added.").assertIsDisplayed()
    }

    @Test
    fun showsReplyingStickyStatusWhileAssistantStreams() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatTranscript(
                    rows = listOf(
                        TranscriptUserRow(turnId = "turn_1", text = "Explain auth"),
                        TranscriptThinkingRow(turnId = "turn_1", text = "planning"),
                        TranscriptAssistantRow(turnId = "turn_1", text = "Auth uses JWT"),
                    ),
                    isRunning = true,
                    showWelcome = false,
                )
            }
        }

        composeTestRule.onNodeWithText("Replying").assertIsDisplayed()
        composeTestRule.onNodeWithTag("activity_status_line").assertIsDisplayed()
        composeTestRule.onNodeWithText("Thinking").assertIsDisplayed()
    }

    @Test
    fun showsUsingToolsStickyStatusAsOnePrimaryLabel() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatTranscript(
                    rows = listOf(
                        TranscriptUserRow(turnId = "turn_1", text = "go"),
                        TranscriptToolRow(
                            turnId = "turn_1",
                            toolCallId = "t1",
                            toolName = "grep",
                            toolKind = ToolKind.Execute,
                            status = ToolCallStatus.Pending,
                            detail = "pattern",
                        ),
                    ),
                    isRunning = true,
                    showWelcome = false,
                )
            }
        }

        composeTestRule.onNodeWithText("grep · pattern").assertIsDisplayed()
        composeTestRule.onNodeWithTag("activity_status_line").assertIsDisplayed()
    }

    @Test
    fun showsWaitingForPermissionOverOtherPhases() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatTranscript(
                    rows = listOf(
                        TranscriptUserRow(turnId = "turn_1", text = "go"),
                        TranscriptToolRow(
                            turnId = "turn_1",
                            toolCallId = "t1",
                            toolName = "read",
                            toolKind = ToolKind.Read,
                            status = ToolCallStatus.Pending,
                        ),
                    ),
                    isRunning = true,
                    hasPendingPermission = true,
                    showWelcome = false,
                )
            }
        }

        composeTestRule.onNodeWithText("Waiting for permission").assertIsDisplayed()
    }

    @Test
    fun hidesStickyStatusWhenNotRunning() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatTranscript(
                    rows = listOf(
                        TranscriptUserRow(turnId = "turn_1", text = "Explain auth"),
                        TranscriptAssistantRow(turnId = "turn_1", text = "Auth uses JWT"),
                    ),
                    isRunning = false,
                    showWelcome = false,
                )
            }
        }

        composeTestRule.onAllNodesWithTag("activity_status_line").assertCountEquals(0)
    }

    @Test
    fun rendersCollapsedToolCallSummaryThatExpands() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatTranscript(
                    rows = listOf(
                        TranscriptUserRow(turnId = "turn_1", text = "go"),
                        TranscriptToolRow(
                            turnId = "turn_1",
                            toolCallId = "t1",
                            toolName = "Read File",
                            toolKind = ToolKind.Read,
                            status = ToolCallStatus.Completed,
                            detail = "/tmp/a.ts",
                        ),
                        TranscriptToolRow(
                            turnId = "turn_1",
                            toolCallId = "t2",
                            toolName = "grep",
                            toolKind = ToolKind.Execute,
                            status = ToolCallStatus.Completed,
                        ),
                        TranscriptToolRow(
                            turnId = "turn_1",
                            toolCallId = "t3",
                            toolName = "shell",
                            toolKind = ToolKind.Execute,
                            status = ToolCallStatus.Completed,
                        ),
                        TranscriptToolRow(
                            turnId = "turn_1",
                            toolCallId = "t4",
                            toolName = "edit",
                            toolKind = ToolKind.Edit,
                            status = ToolCallStatus.Completed,
                        ),
                    ),
                    isRunning = false,
                    showWelcome = false,
                )
            }
        }

        composeTestRule.onNodeWithText("4 tool calls").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("tool_call_item").assertCountEquals(0)

        composeTestRule.onNodeWithTag("tool_call_group_summary").performClick()
        composeTestRule.onNodeWithText("Read File · /tmp/a.ts · completed").assertIsDisplayed()
    }

    @Test
    fun showsRunningCountWhileToolsInProgress() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatTranscript(
                    rows = listOf(
                        TranscriptUserRow(turnId = "turn_1", text = "go"),
                        TranscriptToolRow(
                            turnId = "turn_1",
                            toolCallId = "t1",
                            toolName = "read",
                            toolKind = ToolKind.Read,
                            status = ToolCallStatus.Completed,
                        ),
                        TranscriptToolRow(
                            turnId = "turn_1",
                            toolCallId = "t2",
                            toolName = "grep",
                            toolKind = ToolKind.Execute,
                            status = ToolCallStatus.Pending,
                        ),
                    ),
                    isRunning = true,
                    showWelcome = false,
                )
            }
        }

        composeTestRule.onNodeWithText("2 tool calls · 1 running").assertIsDisplayed()
    }
}
