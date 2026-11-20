package harold.android.network

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LoopbackAddressTest {
    @Test
    fun parsesAViteStyleUrl() {
        val address = parseLoopbackUrl("http://localhost:5173/")!!
        assertEquals("localhost", address.host)
        assertEquals(5173, address.port)
        assertEquals("/", address.path)
        assertFalse(address.secure)
        assertEquals("localhost:5173", address.authority)
        assertEquals("http://localhost:5173/", address.hostUrl)
    }

    @Test
    fun parsesABareHostAndPort() {
        val address = parseLoopbackUrl("localhost:8765")!!
        assertEquals(8765, address.port)
        assertEquals("http://localhost:8765/", address.hostUrl)
    }

    @Test
    fun keepsPathAndSecureScheme() {
        val address = parseLoopbackUrl("https://127.0.0.1:3000/app?tab=2")!!
        assertTrue(address.secure)
        assertEquals("/app?tab=2", address.path)
        assertEquals("https://127.0.0.1:3000/app?tab=2", address.hostUrl)
    }

    @Test
    fun parsesAnIpv6Loopback() {
        val address = parseLoopbackUrl("[::1]:8080")!!
        assertEquals("::1", address.host)
        assertEquals("[::1]:8080", address.authority)
    }

    @Test
    fun rejectsAHostThatIsNotLoopback() {
        assertNull(parseLoopbackUrl("http://example.com:8080"))
        assertNull(parseLoopbackUrl("http://192.168.1.5:3000"))
    }

    @Test
    fun rejectsAMissingOrBadPort() {
        assertNull(parseLoopbackUrl("http://localhost"))
        assertNull(parseLoopbackUrl("localhost:"))
        assertNull(parseLoopbackUrl("localhost:99999"))
        assertNull(parseLoopbackUrl("localhost:0"))
    }

    @Test
    fun rejectsAUrlWithCredentials() {
        assertNull(parseLoopbackUrl("http://user:pass@localhost:8080/"))
    }

    @Test
    fun trimsTrailingPunctuationFromProse() {
        val address = parseLoopbackUrl("http://localhost:3000).")!!
        assertEquals(3000, address.port)
    }
}
