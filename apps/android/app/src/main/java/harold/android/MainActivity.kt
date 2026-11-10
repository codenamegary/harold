package harold.android

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import dagger.hilt.android.AndroidEntryPoint
import harold.android.foreground.EXTRA_OPEN_SESSION_ID
import harold.android.foreground.EXTRA_OPEN_SESSION_LIST
import harold.android.foreground.OpenSessionRequests
import harold.android.navigation.ActivityEffect
import harold.android.navigation.AppNavHost
import harold.android.navigation.FeatureEntryProvider
import harold.android.navigation.Navigator
import harold.android.ui.theme.HaroldTheme
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var openSessionRequests: OpenSessionRequests
    @Inject lateinit var navigator: Navigator
    @Inject lateinit var entryProviders: Set<@JvmSuppressWildcards FeatureEntryProvider>
    @Inject lateinit var activityEffects: Set<@JvmSuppressWildcards ActivityEffect>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        navigator.attach(savedStateRegistry)

        deliverOpenSession(intent)
        deliverDebugNavigation(intent)

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
        deliverDebugNavigation(intent)
    }

    private fun deliverOpenSession(intent: Intent?) {
        if (intent?.getBooleanExtra(EXTRA_OPEN_SESSION_LIST, false) == true) {
            navigator.openSessions()
            return
        }
        val sessionId = intent?.getStringExtra(EXTRA_OPEN_SESSION_ID) ?: return
        openSessionRequests.open(sessionId)
    }

    /**
     * Debug builds only. The capture harness reaches a screen with
     * `am start --es debug_navigate ssh_setup` instead of tapping its way there.
     * Release builds compile the guard and nothing else.
     */
    private fun deliverDebugNavigation(intent: Intent?) {
        if (!BuildConfig.DEBUG) {
            return
        }
        val route = intent?.getStringExtra(EXTRA_DEBUG_NAVIGATE) ?: return
        attemptDebugNavigation(route, attemptsLeft = 20)
    }

    private fun attemptDebugNavigation(route: String, attemptsLeft: Int) {
        window.decorView.post {
            if (navigator.backStack.isEmpty()) {
                if (attemptsLeft > 0) {
                    attemptDebugNavigation(route, attemptsLeft - 1)
                }
                return@post
            }
            when (route) {
                DEBUG_ROUTE_SSH_SETUP -> navigator.openAddConnection()
                DEBUG_ROUTE_CHAT -> navigator.showChat()
            }
        }
    }
}

private const val EXTRA_DEBUG_NAVIGATE = "debug_navigate"
private const val DEBUG_ROUTE_SSH_SETUP = "ssh_setup"
private const val DEBUG_ROUTE_CHAT = "chat"
