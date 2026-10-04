package harold.android.debug

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import harold.android.chat.auth.AgentAuthPanel
import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSession
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AuthSessionStatus
import harold.android.contracts.AuthShowMessageLevel
import harold.android.contracts.AuthStep
import harold.android.ui.theme.HaroldTheme

/**
 * Debug-only fixture host for emulator screenshots.
 * Launch: adb shell am start -n harold.android/.debug.AuthFixtureActivity \
 *   --es scene idle|panel
 */
class AuthFixtureActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val scene = intent.getStringExtra(EXTRA_SCENE) ?: SCENE_IDLE
        setContent {
            HaroldTheme(dynamicColor = false) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.background)
                        .padding(16.dp)
                        .testTag("auth_fixture_root"),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    Text(
                        text = "Auth fixtures",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onBackground,
                    )
                    when (scene) {
                        SCENE_PANEL -> AgentAuthPanel(
                            agentName = "Claude",
                            summary = AgentAuthSummary(
                                status = AgentAuthStatus.NeedsAuth,
                                error = null,
                                activeSessionId = "auth-1",
                                canLogout = false,
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
                                            body = "Sign in on the host machine, then confirm here.",
                                        ),
                                        AuthStep.Confirm(
                                            stepId = "confirm-1",
                                            title = "Ready?",
                                            body = "Finish login on the host, then continue.",
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
                            onCancel = {},
                        )
                        else -> AgentAuthPanel(
                            agentName = "Claude",
                            summary = AgentAuthSummary(
                                status = AgentAuthStatus.NeedsAuth,
                                error = null,
                                activeSessionId = null,
                                canLogout = false,
                            ),
                            auth = AgentAuth(
                                agentId = "claude",
                                status = AgentAuthStatus.NeedsAuth,
                                error = null,
                                session = null,
                            ),
                            submitting = false,
                            actionBusy = false,
                            error = null,
                            onSignIn = {},
                            onConfirm = {},
                            onCancel = {},
                        )
                    }
                }
            }
        }
    }

    companion object {
        const val EXTRA_SCENE = "scene"
        const val SCENE_IDLE = "idle"
        const val SCENE_PANEL = "panel"
    }
}
