package harold.android.pairing

import android.content.Intent
import android.net.Uri
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import dagger.hilt.android.testing.HiltTestApplication
import harold.android.MainActivity
import javax.inject.Inject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@HiltAndroidTest
@RunWith(RobolectricTestRunner::class)
@Config(application = HiltTestApplication::class, sdk = [34])
class MainActivityPairingDeepLinkTest {
    @get:Rule
    val hiltRule = HiltAndroidRule(this)

    @Inject
    lateinit var pairingRequests: PairingRequests

    @Before
    fun setUp() {
        hiltRule.inject()
    }

    @Test
    fun routesIncomingViewIntentDataUriToPairingRequestsOnCreate() {
        val uri = "harold://pair?v=1&endpoint=http%3A%2F%2F10.0.2.2%3A3847&code=R7K-4MP"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri))

        Robolectric.buildActivity(MainActivity::class.java, intent).create()

        assertEquals(uri, pairingRequests.pendingUri.value)
    }

    @Test
    fun routesIncomingViewIntentDataUriToPairingRequestsOnNewIntent() {
        val controller = Robolectric.buildActivity(MainActivity::class.java).create()

        assertNull(pairingRequests.pendingUri.value)

        val uri = "harold://pair?v=1&endpoint=http%3A%2F%2F10.0.2.2%3A3847&code=R7K-4MP"
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uri))
        controller.newIntent(intent)

        assertEquals(uri, pairingRequests.pendingUri.value)
    }

    @Test
    fun ignoresNonViewIntents() {
        val intent = Intent(Intent.ACTION_MAIN)

        Robolectric.buildActivity(MainActivity::class.java, intent).create()

        assertNull(pairingRequests.pendingUri.value)
    }
}
