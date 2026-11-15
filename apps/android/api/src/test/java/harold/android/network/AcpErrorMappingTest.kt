package harold.android.network

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AcpErrorMappingTest {
    @Test
    fun sessionNotFoundCodeIsGone() {
        assertTrue(isAcpSessionGoneError(SESSION_NOT_FOUND_CODE, null))
        assertTrue(isAcpSessionGoneError(SESSION_NOT_FOUND_CODE, "anything"))
    }

    @Test
    fun unknownSessionWordingIsGone() {
        assertTrue(isAcpSessionGoneError(-32001, "Unknown session: ses_01"))
        assertTrue(isAcpSessionGoneError(-32001, "session_not_found"))
        assertTrue(isAcpSessionGoneError(-32001, "No such session"))
        assertTrue(isAcpSessionGoneError(-32001, "Session does not exist"))
    }

    @Test
    fun unrelatedErrorsAreNotGone() {
        assertFalse(isAcpSessionGoneError(-32601, "Method not found"))
        assertFalse(isAcpSessionGoneError(-32000, "Authentication required"))
        assertFalse(isAcpSessionGoneError(null, null))
    }
}
