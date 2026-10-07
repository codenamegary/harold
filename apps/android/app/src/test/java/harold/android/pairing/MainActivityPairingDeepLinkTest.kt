package harold.android.pairing

import android.content.Intent
import android.net.Uri
import harold.android.HaroldApplication
import harold.android.MainActivity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MainActivityPairingDeepLinkTest {

    @Test
    fun routesIncomingViewIntentDataUriToPairingRequestsOnCreate() {
        val uri = "harold://pair?v=1&endpoint=http%3A%2F%2F10.0.2.2%3A3847&code=R7K-4MP"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri))

        val controller = Robolectric.buildActivity(MainActivity::class.java, intent)
        val activity = controller.create().get()

        val appContainer = (activity.application as HaroldApplication).appContainer
        assertEquals(uri, appContainer.pairingRequests.pendingUri.value)
    }

    @Test
    fun routesIncomingViewIntentDataUriToPairingRequestsOnNewIntent() {
        val controller = Robolectric.buildActivity(MainActivity::class.java)
        val activity = controller.create().get()

        val appContainer = (activity.application as HaroldApplication).appContainer
        assertNull(appContainer.pairingRequests.pendingUri.value)

        val uri = "harold://pair?v=1&endpoint=http%3A%2F%2F10.0.2.2%3A3847&code=R7K-4MP"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri))
        controller.newIntent(intent)

        assertEquals(uri, appContainer.pairingRequests.pendingUri.value)
    }

    @Test
    fun ignoresNonViewIntents() {
        val intent = Intent(Intent.ACTION_MAIN)

        val controller = Robolectric.buildActivity(MainActivity::class.java, intent)
        val activity = controller.create().get()

        val appContainer = (activity.application as HaroldApplication).appContainer
        assertNull(appContainer.pairingRequests.pendingUri.value)
    }
}
