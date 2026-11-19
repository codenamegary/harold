package harold.android.live

/** Monotonic time source for the bounded reconnect window. */
fun interface ReconnectClock {
    fun nowNanos(): Long
}
