package harold.android.transport.ssh

import com.jcraft.jsch.JSchException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class LoopbackForwardBindTest {
    @Test
    fun aFreePreferredPortIsBoundDirectly() {
        val requests = mutableListOf<Int>()

        val localPort = bindLoopbackForward(8765) { requested ->
            requests += requested
            requested
        }

        assertEquals(8765, localPort)
        assertEquals(listOf(8765), requests)
    }

    @Test
    fun aBusyPreferredPortFallsBackToAnEphemeralPort() {
        val requests = mutableListOf<Int>()

        val localPort = bindLoopbackForward(8765) { requested ->
            requests += requested
            if (requested == 8765) {
                throw JSchException("PortForwardingL: local port 127.0.0.1:8765 cannot be bound.")
            }
            EPHEMERAL_PORT
        }

        assertEquals(EPHEMERAL_PORT, localPort)
        assertEquals(listOf(8765, 0), requests)
    }

    @Test
    fun noPreferredPortAsksTheOsForOne() {
        val requests = mutableListOf<Int>()

        val localPort = bindLoopbackForward(null) { requested ->
            requests += requested
            EPHEMERAL_PORT
        }

        assertEquals(EPHEMERAL_PORT, localPort)
        assertEquals(listOf(0), requests)
    }

    @Test
    fun aFailedEphemeralPortStillReportsTheFailure() {
        val requests = mutableListOf<Int>()

        assertThrows(JSchException::class.java) {
            bindLoopbackForward(8765) { requested ->
                requests += requested
                throw JSchException("cannot be bound")
            }
        }

        assertEquals(listOf(8765, 0), requests)
    }

    private companion object {
        private const val EPHEMERAL_PORT = 49_152
    }
}
