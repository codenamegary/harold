package harold.android.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import androidx.compose.ui.unit.dp
import harold.android.contracts.ToolCallStatus
import harold.android.contracts.ToolKind
import harold.android.live.TranscriptAssistantRow
import harold.android.live.TranscriptRow
import harold.android.live.TranscriptThinkingRow
import harold.android.live.TranscriptToolRow
import harold.android.live.TranscriptUserRow
import harold.android.ui.theme.HaroldTheme
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

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
            HaroldTheme(dynamicColor = false) {
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
    fun expandsThinkingSectionWhileTheAgentIsThinking() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
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
        composeTestRule.onNodeWithTag("thinking_section_body").assertIsDisplayed()
        composeTestRule.onNodeWithText("Thinking").assertIsDisplayed()
        composeTestRule.onNodeWithText("Thinking...").assertIsDisplayed()
    }

    @Test
    fun rendersCompletedThinkingAsCollapsibleSection() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
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
        composeTestRule.onNodeWithText("Thinking...").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("thinking_section_body").assertCountEquals(0)

        composeTestRule.onNodeWithText("Thinking...").performClick()
        composeTestRule.onNodeWithText("planning").assertIsDisplayed()
    }

    @Test
    fun showsTheFinalAssistantReplyOnACompletedTurn() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
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
            HaroldTheme(dynamicColor = false) {
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
            HaroldTheme(dynamicColor = false) {
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
        composeTestRule.onNodeWithText("Thinking...").assertIsDisplayed()
    }

    @Test
    fun showsTheActiveToolRowWithoutADuplicateActivityLine() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
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

        composeTestRule.onNodeWithText("Search pattern").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("activity_status_line").assertCountEquals(0)
        composeTestRule.onAllNodesWithText("grep · pattern").assertCountEquals(0)
    }

    @Test
    fun showsWaitingForPermissionOverOtherPhases() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
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
            HaroldTheme(dynamicColor = false) {
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
            HaroldTheme(dynamicColor = false) {
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

        composeTestRule.onNodeWithText("4 completed").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("tool_call_item").assertCountEquals(0)

        composeTestRule.onNodeWithTag("tool_call_group_summary").performClick()
        composeTestRule.onNodeWithText("Read a.ts").assertIsDisplayed()
    }

    @Test
    fun keepsTheActiveToolVisibleWhileCompletedCallsFold() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
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
                            detail = "pattern",
                        ),
                    ),
                    isRunning = true,
                    showWelcome = false,
                )
            }
        }

        composeTestRule.onNodeWithText("1 completed").assertIsDisplayed()
        composeTestRule.onNodeWithText("Search pattern").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("activity_status_line").assertCountEquals(0)
    }

    @Test
    fun rendersThePromptAsATurnHeaderWithAttachmentChips() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                Box(modifier = Modifier.width(320.dp)) {
                    ChatTranscript(
                        rows = listOf(
                            TranscriptUserRow(
                                turnId = "turn_1",
                                text = "Refactor the transcript",
                                attachmentNames = listOf("notes.md", "design.png"),
                            ),
                        ),
                        isRunning = false,
                        showWelcome = false,
                    )
                }
            }
        }

        composeTestRule.onNodeWithTag("transcript_turn_header").assertIsDisplayed()
        composeTestRule.onNodeWithTag("turn_accent").assertIsDisplayed()
        composeTestRule.onNodeWithTag("transcript_user").assertIsDisplayed()
        composeTestRule.onNodeWithText("Refactor the transcript").assertIsDisplayed()
        composeTestRule.onAllNodesWithTag("attachment_chip").assertCountEquals(2)
        composeTestRule.onNodeWithText("notes.md").assertIsDisplayed()
        composeTestRule.onNodeWithText("design.png").assertIsDisplayed()
    }

    @Test
    fun clampsALongPromptAtEightLinesAndExpandsInPlace() {
        val prompt = (1..20).joinToString("\n") { line -> "Line $line" }
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                Box(modifier = Modifier.width(320.dp)) {
                    ChatTranscript(
                        rows = listOf(TranscriptUserRow(turnId = "turn_1", text = prompt)),
                        isRunning = false,
                        showWelcome = false,
                    )
                }
            }
        }

        val collapsedBounds = composeTestRule
            .onNodeWithTag("transcript_user")
            .getUnclippedBoundsInRoot()
        val collapsedHeight = collapsedBounds.bottom - collapsedBounds.top
        composeTestRule.onNodeWithText("Show full prompt").assertIsDisplayed()

        composeTestRule.onNodeWithText("Show full prompt").performClick()
        val expandedBounds = composeTestRule
            .onNodeWithTag("transcript_user")
            .getUnclippedBoundsInRoot()
        val expandedHeight = expandedBounds.bottom - expandedBounds.top
        assertTrue("expanded prompt should be taller", expandedHeight > collapsedHeight)
        composeTestRule.onNodeWithText("Show less").assertIsDisplayed()
    }

    @Test
    fun collapsesThinkingWhenTheAgentStopsThinking() {
        var running by mutableStateOf(true)
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatTranscript(
                    rows = listOf(
                        TranscriptUserRow(turnId = "turn_1", text = "Explain auth"),
                        TranscriptThinkingRow(turnId = "turn_1", text = "planning"),
                    ),
                    isRunning = running,
                    showWelcome = false,
                )
            }
        }

        composeTestRule.onNodeWithTag("thinking_section_body").assertIsDisplayed()

        composeTestRule.runOnIdle { running = false }
        composeTestRule.waitForIdle()

        composeTestRule.onAllNodesWithTag("thinking_section_body").assertCountEquals(0)
    }

    @Test
    fun keepsFailedToolsVisibleWithTheirDetailOpen() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatTranscript(
                    rows = listOf(
                        TranscriptUserRow(turnId = "turn_1", text = "Edit the theme"),
                        TranscriptToolRow(
                            turnId = "turn_1",
                            toolCallId = "t1",
                            toolName = "edit",
                            toolKind = ToolKind.Edit,
                            status = ToolCallStatus.Failed,
                            detail = "Theme.kt\n+ val x = 1\n- val y = 2",
                        ),
                    ),
                    isRunning = false,
                    showWelcome = false,
                )
            }
        }

        composeTestRule.onNodeWithText("Edit Theme.kt").assertIsDisplayed()
        composeTestRule.onNodeWithTag("tool_call_item_body").assertIsDisplayed()
        composeTestRule
            .onNodeWithTag("tool_status_dot", useUnmergedTree = true)
            .assertContentDescriptionEquals("Failed")
        composeTestRule.onAllNodesWithTag("tool_call_group_summary").assertCountEquals(0)
    }

    @Test
    fun foldsCompletedCallsPerRunAndStopsAtText() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ChatTranscript(
                    rows = listOf(
                        TranscriptUserRow(turnId = "turn_1", text = "go"),
                        toolRow("t1", "read"),
                        TranscriptAssistantRow(turnId = "turn_1", text = "between"),
                        toolRow("t2", "read"),
                    ),
                    isRunning = false,
                    showWelcome = false,
                )
            }
        }

        composeTestRule.onAllNodesWithText("1 completed").assertCountEquals(2)
        composeTestRule.onAllNodesWithTag("tool_call_item").assertCountEquals(0)
    }

    @Test
    fun showsAJumpToLatestPillWhenTheReaderScrollsAway() {
        val rows = buildList {
            add(TranscriptUserRow(turnId = "turn_1", text = "go"))
            repeat(30) { index ->
                add(TranscriptAssistantRow(turnId = "turn_1", text = "Reply $index"))
            }
        }
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                Box(modifier = Modifier.height(240.dp)) {
                    ChatTranscript(
                        rows = rows,
                        isRunning = false,
                        showWelcome = false,
                    )
                }
            }
        }

        composeTestRule.onNodeWithTag("chat_transcript").performTouchInput { swipeDown() }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithTag("jump_to_latest").assertIsDisplayed()
        composeTestRule.onNodeWithTag("jump_to_latest").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onAllNodesWithTag("jump_to_latest").assertCountEquals(0)
    }

    @Test
    fun keepsTheReaderPositionWhenNewOutputArrivesWhileScrolledAway() {
        var rows by mutableStateOf(
            buildList<TranscriptRow> {
                add(TranscriptUserRow(turnId = "turn_1", text = "go"))
                repeat(30) { index ->
                    add(TranscriptAssistantRow(turnId = "turn_1", text = "Reply $index"))
                }
            },
        )
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                Box(modifier = Modifier.height(240.dp)) {
                    ChatTranscript(
                        rows = rows,
                        isRunning = true,
                        showWelcome = false,
                    )
                }
            }
        }

        repeat(5) {
            composeTestRule.onNodeWithTag("chat_transcript").performTouchInput { swipeDown() }
        }
        composeTestRule.waitForIdle()

        val anchor = composeTestRule
            .onAllNodesWithText("Reply", substring = true)
            .fetchSemanticsNodes()
            .firstNotNullOf { node ->
                node.config[SemanticsProperties.Text].firstOrNull()?.text
            }

        composeTestRule.runOnIdle {
            rows = rows + TranscriptAssistantRow(turnId = "turn_1", text = "New reply")
        }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText(anchor).assertIsDisplayed()
        composeTestRule.onNodeWithTag("jump_to_latest").assertIsDisplayed()
    }
}
