package server.agent.android.chat.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import server.agent.android.contracts.AgentAuth
import server.agent.android.contracts.AgentAuthSession
import server.agent.android.contracts.AgentAuthStatus
import server.agent.android.contracts.AgentAuthSummary
import server.agent.android.contracts.AuthDoneOutcome
import server.agent.android.contracts.AuthSessionStatus
import server.agent.android.contracts.AuthShowMessageLevel
import server.agent.android.contracts.AuthStep
import server.agent.android.ui.theme.AgentServerTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class AgentAuthUiTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun panelIdleShowsSignInAndInvokesClick() {
        var signedIn = false
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                AgentAuthPanel(
                    agentName = "Claude",
                    summary = summary(status = AgentAuthStatus.NeedsAuth),
                    auth = AgentAuth(
                        agentId = "claude",
                        status = AgentAuthStatus.NeedsAuth,
                        error = null,
                        session = null,
                    ),
                    submitting = false,
                    actionBusy = false,
                    error = null,
                    onSignIn = { signedIn = true },
                    onConfirm = {},
                    onCancel = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Host login").assertIsDisplayed()
        composeTestRule.onNodeWithTag("agent_auth_sign_in")
            .assertIsEnabled()
            .performClick()
        assertTrue(signedIn)
    }

    @Test
    fun panelIdleShowsStartingWhenSubmitting() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                AgentAuthPanel(
                    agentName = "Claude",
                    summary = summary(status = AgentAuthStatus.NeedsAuth),
                    auth = AgentAuth(
                        agentId = "claude",
                        status = AgentAuthStatus.NeedsAuth,
                        error = null,
                        session = null,
                    ),
                    submitting = true,
                    actionBusy = false,
                    error = null,
                    onSignIn = {},
                    onConfirm = {},
                    onCancel = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Starting…").assertIsDisplayed()
    }

    @Test
    fun authStepViewRendersEachV1StepType() {
        val steps = listOf(
            AuthStep.ShowMessage(level = AuthShowMessageLevel.Info, body = "Sign in on the host"),
            AuthStep.Confirm(
                stepId = "confirm-1",
                title = "Ready?",
                body = "Finish login on the host",
                confirmLabel = "I have logged in",
            ),
            AuthStep.Working(label = "Checking…"),
            AuthStep.Done(outcome = AuthDoneOutcome.Succeeded, message = null),
        )
        var confirmedStepId: String? = null

        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                steps.forEach { step ->
                    AuthStepView(
                        step = step,
                        confirmDisabled = false,
                        confirming = false,
                        onConfirm = { confirmedStepId = it },
                    )
                }
            }
        }

        composeTestRule.onNodeWithText("Sign in on the host").assertIsDisplayed()
        composeTestRule.onNodeWithText("Ready?").assertIsDisplayed()
        composeTestRule.onNodeWithText("I have logged in").assertIsDisplayed().performClick()
        composeTestRule.onNodeWithText("Checking…").assertIsDisplayed()
        composeTestRule.onNodeWithText("Signed in").assertIsDisplayed()
        assertEquals("confirm-1", confirmedStepId)
    }

    @Test
    fun panelShowsInProgressStepsAndCancel() {
        var cancelled = false
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                AgentAuthPanel(
                    agentName = "Claude",
                    summary = summary(
                        status = AgentAuthStatus.NeedsAuth,
                        activeSessionId = "auth-1",
                    ),
                    auth = AgentAuth(
                        agentId = "claude",
                        status = AgentAuthStatus.NeedsAuth,
                        error = null,
                        session = AgentAuthSession(
                            sessionId = "auth-1",
                            agentId = "claude",
                            status = AuthSessionStatus.InProgress,
                            steps = listOf(
                                AuthStep.ShowMessage(
                                    level = AuthShowMessageLevel.Info,
                                    body = "Sign in on the host",
                                ),
                                AuthStep.Confirm(
                                    stepId = "confirm-1",
                                    title = "Ready?",
                                    body = "Finish login",
                                    confirmLabel = "I have logged in",
                                ),
                            ),
                            error = null,
                        ),
                    ),
                    submitting = false,
                    actionBusy = false,
                    error = null,
                    onSignIn = {},
                    onConfirm = {},
                    onCancel = { cancelled = true },
                )
            }
        }

        composeTestRule.onNodeWithTag("agent_auth_panel").assertIsDisplayed()
        composeTestRule.onNodeWithText("Host login").assertIsDisplayed()
        composeTestRule.onNodeWithText("Sign in on the host").assertIsDisplayed()
        composeTestRule.onNodeWithTag("agent_auth_cancel").performClick()
        assertTrue(cancelled)
    }

    private fun summary(
        status: AgentAuthStatus,
        error: String? = null,
        activeSessionId: String? = null,
        canLogout: Boolean = false,
    ) = AgentAuthSummary(
        status = status,
        error = error,
        activeSessionId = activeSessionId,
        canLogout = canLogout,
    )
}
