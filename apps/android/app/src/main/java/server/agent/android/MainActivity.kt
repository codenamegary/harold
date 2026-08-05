package server.agent.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import server.agent.android.navigation.AppNavHost
import server.agent.android.ui.theme.AgentServerTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val appContainer = (application as AgentServerApplication).appContainer

        enableEdgeToEdge()
        setContent {
            AgentServerTheme {
                AppNavHost(appContainer = appContainer)
            }
        }
    }
}
