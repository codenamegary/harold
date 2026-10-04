package harold.android.chat

import android.app.Application
import org.vosk.Model
import org.vosk.android.StorageService
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicReference

/**
 * Loads the bundled Vosk model from assets into app storage.
 * Asset folder name must match [ASSET_MODEL_PATH].
 */
class VoskModelStore(
    private val application: Application,
) {
    private val modelRef = AtomicReference<Model?>(null)
    private val failureRef = AtomicReference<Exception?>(null)
    private val waiters = CopyOnWriteArrayList<(Result<Model>) -> Unit>()
    private var started = false

    fun ensureLoaded(onResult: (Result<Model>) -> Unit) {
        modelRef.get()?.let {
            onResult(Result.success(it))
            return
        }
        failureRef.get()?.let {
            onResult(Result.failure(it))
            return
        }

        waiters.add(onResult)
        startUnpackIfNeeded()
    }

    fun hasFailed(): Boolean = failureRef.get() != null

    private fun startUnpackIfNeeded() {
        synchronized(this) {
            if (started) {
                return
            }
            started = true
        }

        StorageService.unpack(
            application,
            ASSET_MODEL_PATH,
            STORAGE_TARGET_PATH,
            { model ->
                modelRef.set(model)
                drainWaiters(Result.success(model))
            },
            { error ->
                val exception = error ?: Exception("Unknown model unpack error")
                failureRef.set(exception)
                drainWaiters(Result.failure(exception))
            },
        )
    }

    private fun drainWaiters(result: Result<Model>) {
        val pending = waiters.toList()
        waiters.clear()
        pending.forEach { it(result) }
    }

    companion object {
        const val ASSET_MODEL_PATH = "model-en-us"
        const val STORAGE_TARGET_PATH = "model"
    }
}
