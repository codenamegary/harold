package server.agent.android.chat

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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

    @Test
    fun showsThinkingIndicatorWhileRunningBeforeAssistantOutput() {
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

        composeTestRule.onNodeWithTag("thinking_indicator").assertIsDisplayed()
        composeTestRule.onNodeWithTag("chat_progress").assertIsDisplayed()
    }

    @Test
    fun showsThinkingIndicatorOnActiveThoughtRowWhileRunning() {
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

        composeTestRule
            .onNodeWithTag("thinking_indicator", useUnmergedTree = true)
            .assertIsDisplayed()
        composeTestRule.onNodeWithTag("thinking_section").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("thinking_section_body").assertCountEquals(0)
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

        composeTestRule.onAllNodesWithTag("thinking_indicator").assertCountEquals(0)
        composeTestRule.onNodeWithText("Thinking").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("thinking_section_body").assertCountEquals(0)

        composeTestRule.onNodeWithText("Thinking").performClick()
        composeTestRule.onNodeWithText("planning").assertIsDisplayed()
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
