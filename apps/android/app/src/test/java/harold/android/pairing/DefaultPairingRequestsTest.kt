package harold.android.pairing

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DefaultPairingRequestsTest {

    @Test
    fun requestsAndConsumesPendingUri() {
        val requests = DefaultPairingRequests()
        assertNull(requests.pendingUri.value)

        val uri = "harold://pair?v=1&endpoint=https%3A%2F%2Fagent.example.com&code=R7K-4MP"
        requests.requestPairing(uri)

        assertEquals(uri, requests.pendingUri.value)
        val consumed = requests.consume()

        assertEquals(uri, consumed)
        assertNull(requests.pendingUri.value)
        assertNull(requests.consume())
    }
}
