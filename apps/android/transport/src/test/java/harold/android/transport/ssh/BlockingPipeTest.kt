package harold.android.transport.ssh

import java.io.ByteArrayOutputStream
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class BlockingPipeTest {
    @Test
    fun outputSurvivesTheThreadThatLastWrote() {
        val pipe = BlockingPipe()
        val received = ByteArrayOutputStream()
        val readFailure = AtomicReference<Throwable>()
        val readerDone = CountDownLatch(1)
        val reader = Thread {
            try {
                val buffer = ByteArray(64)
                while (true) {
                    val count = pipe.input.read(buffer)
                    if (count < 0) {
                        break
                    }
                    synchronized(received) { received.write(buffer, 0, count) }
                }
            } catch (error: Throwable) {
                readFailure.set(error)
            } finally {
                readerDone.countDown()
            }
        }
        reader.start()

        writeOnItsOwnThread(pipe, "one")
        // Give the old JDK pipe time to notice that its writer thread died.
        Thread.sleep(1_500)
        writeOnItsOwnThread(pipe, "two")

        pipe.output.close()
        assertTrue(readerDone.await(5, TimeUnit.SECONDS))
        assertEquals(
            "onetwo",
            synchronized(received) { received.toString(Charsets.UTF_8.name()) },
        )
        assertNull(readFailure.get())
        reader.join(5_000)
    }

    private fun writeOnItsOwnThread(pipe: BlockingPipe, value: String) {
        val failure = AtomicReference<Throwable>()
        val writer = Thread {
            try {
                pipe.output.write(value.toByteArray())
            } catch (error: Throwable) {
                failure.set(error)
            }
        }
        writer.start()
        writer.join(5_000)
        failure.get()?.let { error -> throw AssertionError("write failed", error) }
    }
}
