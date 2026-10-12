package harold.android.navigation

import androidx.compose.runtime.Composable

/**
 * Composable work a feature runs for the whole life of the activity, outside any route.
 * The shell uses it to keep its view model alive, so it can pick the start route and
 * send the user back to pairing when access is lost.
 */
fun interface ActivityEffect {
    @Composable
    fun Run()
}
