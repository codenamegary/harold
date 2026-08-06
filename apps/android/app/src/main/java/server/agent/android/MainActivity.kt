package server.agent.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import server.agent.android.foreground.EXTRA_OPEN_SESSION_ID
import server.agent.android.navigation.AppNavHost
import server.agent.android.ui.theme.AgentServerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val appContainer = (application as AgentServerApplication).appContainer
        deliverOpenSession(intent)

        enableEdgeToEdge()
        setContent {
            AgentServerTheme {
                AppNavHost(appContainer = appContainer)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        deliverOpenSession(intent)
    }

    private fun deliverOpenSession(intent: Intent?) {
        val sessionId = intent?.getStringExtra(EXTRA_OPEN_SESSION_ID) ?: return
        val appContainer = (application as AgentServerApplication).appContainer
        appContainer.openSessionRequests.open(sessionId)
    }
}
