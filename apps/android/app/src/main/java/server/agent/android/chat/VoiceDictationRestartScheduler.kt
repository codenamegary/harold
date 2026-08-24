package server.agent.android.chat

import android.os.Handler
import android.os.Looper

/**
 * Schedules a single delayed restart after recognizer-busy failures.
 * [schedule] replaces any previously pending restart.
 */
interface VoiceDictationRestartScheduler {
    fun schedule(delayMs: Long, action: () -> Unit)

    fun cancel()
}

/** Runs [action] immediately. Useful in unit tests. */
class ImmediateVoiceDictationRestartScheduler : VoiceDictationRestartScheduler {
    override fun schedule(delayMs: Long, action: () -> Unit) {
        action()
    }

    override fun cancel() = Unit
}

/** Holds the pending action until [runPending] is called. For race-condition unit tests. */
class ManualVoiceDictationRestartScheduler : VoiceDictationRestartScheduler {
    private var pending: (() -> Unit)? = null
    var lastDelayMs: Long? = null
        private set

    override fun schedule(delayMs: Long, action: () -> Unit) {
        lastDelayMs = delayMs
        pending = action
    }

    override fun cancel() {
        pending = null
        lastDelayMs = null
    }

    fun runPending() {
        val action = pending
        pending = null
        lastDelayMs = null
        action?.invoke()
    }

    fun hasPending(): Boolean = pending != null
}

class HandlerVoiceDictationRestartScheduler(
    private val handler: Handler = Handler(Looper.getMainLooper()),
) : VoiceDictationRestartScheduler {
    private var pending: Runnable? = null

    override fun schedule(delayMs: Long, action: () -> Unit) {
        cancel()
        val runnable = Runnable {
            pending = null
            action()
        }
        pending = runnable
        handler.postDelayed(runnable, delayMs)
    }

    override fun cancel() {
        pending?.let { handler.removeCallbacks(it) }
        pending = null
    }
}
