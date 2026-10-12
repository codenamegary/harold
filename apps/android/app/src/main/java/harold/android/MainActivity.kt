package harold.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import dagger.hilt.android.AndroidEntryPoint
import harold.android.foreground.EXTRA_OPEN_SESSION_ID
import harold.android.foreground.OpenSessionRequests
import harold.android.navigation.ActivityEffect
import harold.android.navigation.AppNavHost
import harold.android.navigation.FeatureEntryProvider
import harold.android.navigation.Navigator
import harold.android.pairing.PairingRequests
import harold.android.ui.theme.HaroldTheme
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var openSessionRequests: OpenSessionRequests
    @Inject lateinit var pairingRequests: PairingRequests
    @Inject lateinit var navigator: Navigator
    @Inject lateinit var entryProviders: Set<@JvmSuppressWildcards FeatureEntryProvider>
    @Inject lateinit var activityEffects: Set<@JvmSuppressWildcards ActivityEffect>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        navigator.attach(savedStateRegistry)

        deliverOpenSession(intent)
        deliverPairingDeepLink(intent)

        enableEdgeToEdge()
        setContent {
            HaroldTheme {
                AppNavHost(
                    navigator = navigator,
                    entryProviders = entryProviders,
                    activityEffects = activityEffects,
                )
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
        openSessionRequests.open(sessionId)
    }

    private fun deliverPairingDeepLink(intent: Intent?) {
        val uri = intent?.dataString ?: return
        if (intent.action == Intent.ACTION_VIEW) {
            pairingRequests.requestPairing(uri)
            navigator.openPairing()
        }
    }
}
