package harold.android.chat

import harold.android.database.session.SessionCatalog
import harold.android.database.session.SessionRepository
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Why a session catalog scan was requested. Triggers with a non-zero
 * [maxAgeMillis] reuse a recent scan; a zero means the caller needs a fresh
 * one.
 */
enum class SessionRefreshTrigger(val maxAgeMillis: Long) {
    /** Cold start or first screen that needs the catalog. */
    AppStart(60_000),

    /** A saved connection became active. The host may have been asleep. */
    ConnectionChanged(0),

    /** A new session exists, so the list must pick up its real title. */
    SessionCreated(0),

    /** Returning to the app. The host may have changed while we were away. */
    Foreground(0),

    /** Opening the recent-session picker. It shows only a small slice. */
    PickerOpened(0),

    /** Opening the full sessions screen. */
    SessionsScreenOpened(60_000),

    /** The user asked to try again after a failure. */
    Retry(0),
}

/** One catalog scan, or the last good one when the trigger reused it. */
data class SessionRefreshOutcome(
    val catalog: SessionCatalog,
    val refreshed: Boolean,
)

/**
 * Serializes full catalog scans across screens. Concurrent callers for the
 * same connection share the scan that was already running, and event triggers
 * inside the trigger's max age reuse the last good result instead of listing
 * every agent again.
 *
 * This is memory only. A process death drops the timestamps and the cached
 * catalogs; the next trigger scans from scratch.
 */
@Singleton
class SessionCatalogRefresher @Inject constructor(
    private val repository: SessionRepository,
) {
    private val locks = ConcurrentHashMap<String, Mutex>()
    private val lastSuccessAt = ConcurrentHashMap<String, Long>()
    private val lastCatalog = ConcurrentHashMap<String, SessionCatalog>()
    private val successEpoch = ConcurrentHashMap<String, Long>()

    internal var nowMillis: () -> Long = System::currentTimeMillis

    suspend fun refresh(
        connectionId: String,
        trigger: SessionRefreshTrigger,
    ): Result<SessionRefreshOutcome> {
        val requestedAt = nowMillis()
        val epochAtRequest = successEpoch.getOrDefault(connectionId, 0L)
        return lockFor(connectionId).withLock {
            val previousAt = lastSuccessAt[connectionId]
            val fresh = trigger.maxAgeMillis > 0 &&
                previousAt != null &&
                requestedAt - previousAt < trigger.maxAgeMillis
            val completedWhileWaiting =
                successEpoch.getOrDefault(connectionId, 0L) != epochAtRequest
            val cached = if (fresh || completedWhileWaiting) lastCatalog[connectionId] else null
            if (cached != null) {
                Result.success(SessionRefreshOutcome(catalog = cached, refreshed = false))
            } else {
                scan(connectionId)
            }
        }
    }

    private suspend fun scan(connectionId: String): Result<SessionRefreshOutcome> =
        repository.refresh(connectionId).map { catalog ->
            lastSuccessAt[connectionId] = nowMillis()
            lastCatalog[connectionId] = catalog
            successEpoch.merge(connectionId, 1L, Long::plus)
            SessionRefreshOutcome(catalog = catalog, refreshed = true)
        }

    private fun lockFor(connectionId: String): Mutex =
        locks.computeIfAbsent(connectionId) { Mutex() }
}
