package harold.android.acp

import harold.android.process.AgentAuthRequiredException
import harold.android.process.AgentSessionGoneException
import harold.android.stream.DisconnectCause
import harold.android.stream.SessionStatus
import java.io.IOException
import java.net.ConnectException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionAttachFailureTest {
    @Test
    fun connectExceptionIsRetryableAndOffline() {
        val error = ConnectException("ENETUNREACH")

        assertEquals(SessionStatus.Offline, attachFailureStatus(error))
        assertTrue(attachFailureCause(error) is DisconnectCause.Retryable)
    }

    @Test
    fun ioAndSshFailuresAreRetryableTransportFailures() {
        val io = IOException("Connection reset by peer")
        val ssh = Exception("com.jcraft.jsch.JSchException: session is down")

        assertEquals(SessionStatus.Offline, attachFailureStatus(io))
        assertEquals(SessionStatus.Offline, attachFailureStatus(ssh))
        assertTrue(attachFailureCause(io) is DisconnectCause.Retryable)
        assertTrue(attachFailureCause(ssh) is DisconnectCause.Retryable)
    }

    @Test
    fun authAndGoneStayTerminal() {
        val auth = AgentAuthRequiredException("cursor", "Sign in on the host.")
        val gone = AgentSessionGoneException("cursor", "sess_01", "Unknown session")

        assertEquals(SessionStatus.AuthFailed, attachFailureStatus(auth))
        assertEquals(SessionStatus.Gone, attachFailureStatus(gone))
        assertTrue(attachFailureCause(auth) is DisconnectCause.Unauthorized)
        assertTrue(attachFailureCause(gone) is DisconnectCause.Gone)
    }

    @Test
    fun acpProtocolErrorsStayTerminal() {
        val error = AcpRemoteException(code = -32600, detail = "Unsupported method", data = null)

        assertEquals(SessionStatus.Error, attachFailureStatus(error))
        assertTrue(attachFailureCause(error) is DisconnectCause.Protocol)
    }
}
