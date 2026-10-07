package harold.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import harold.android.foreground.EXTRA_OPEN_SESSION_ID
import harold.android.navigation.AppNavHost
import harold.android.ui.theme.HaroldTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val appContainer = (application as HaroldApplication).appContainer
        deliverOpenSession(intent)
        deliverPairingDeepLink(intent)

        enableEdgeToEdge()
        setContent {
            HaroldTheme {
                AppNavHost(appContainer = appContainer)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        deliverOpenSession(intent)
        deliverPairingDeepLink(intent)
    }

    private fun deliverOpenSession(intent: Intent?) {
        val sessionId = intent?.getStringExtra(EXTRA_OPEN_SESSION_ID) ?: return
        val appContainer = (application as HaroldApplication).appContainer
        appContainer.openSessionRequests.open(sessionId)
    }

    private fun deliverPairingDeepLink(intent: Intent?) {
        val uri = intent?.dataString ?: return
        if (intent.action == Intent.ACTION_VIEW) {
            val appContainer = (application as HaroldApplication).appContainer
            appContainer.pairingRequests.requestPairing(uri)
        }
    }
}
