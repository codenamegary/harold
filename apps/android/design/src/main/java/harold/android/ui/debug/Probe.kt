package harold.android.ui.debug

import android.os.SystemClock
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicLong

/**
 * A control the debug control plane can address by tag.
 *
 * Bounds are device pixels on the screen, which is what `adb shell input tap`
 * expects. Screen space matters for controls inside a Popup, because a popup is
 * its own window and `boundsInWindow` would report popup-local coordinates.
 */
data class ProbeControl(
    val tag: String,
    val left: Int,
    val top: Int,
    val right: Int,
    val bottom: Int,
    val enabled: Boolean,
) {
    val centerX: Int get() = (left + right) / 2
    val centerY: Int get() = (top + bottom) / 2
    val width: Int get() = right - left
    val height: Int get() = bottom - top
}

/** One event on the device clock. Converted to host time through [Probe.anchorNanos]. */
data class ProbeMark(val nanos: Long, val kind: String)

/**
 * The command surface of whichever screen is on top.
 *
 * [perform] runs off the main thread. Implementations must only touch thread
 * safe state, which in practice means the ViewModel behind the screen.
 */
interface ScreenProbe {
    val name: String

    /** Everything the driver needs to assert on, as flat strings. */
    fun facts(): Map<String, String>

    /** Names accepted by [perform]. */
    fun actions(): List<String>

    /** True when the work landed. False means the call was refused or unknown. */
    fun perform(action: String, args: Map<String, String>): Boolean

    /** True when nothing is in flight, so the driver can stop waiting. */
    fun settled(): Boolean
}

/**
 * Process wide registry for the debug control plane.
 *
 * Every method is inert unless [enabled] is true, which only the debug build's
 * initializer does. Release builds compile the same call sites but never fill
 * the map and never emit a mark.
 */
object Probe {
    /** Set once by the debug initializer before any content is composed. */
    @Volatile
    var enabled: Boolean = false

    @Volatile
    private var probe: ScreenProbe? = null

    private val controls = ConcurrentHashMap<String, ProbeControl>()
    private val marks = CopyOnWriteArrayList<ProbeMark>()
    private val markCounter = AtomicLong(0)

    /**
     * Device clock at the calibration blink. Written by the driver's anchor
     * call so every mark can be mapped onto host monotonic time exactly.
     */
    @Volatile
    var anchorNanos: Long = 0L

    fun install(next: ScreenProbe) {
        controls.clear()
        probe = next
    }

    fun uninstall(expected: ScreenProbe) {
        if (probe === expected) {
            probe = null
            controls.clear()
        }
    }

    fun current(): ScreenProbe? = probe

    fun record(control: ProbeControl) {
        if (enabled) {
            controls[control.tag] = control
        }
    }

    fun controls(): List<ProbeControl> = controls.values.sortedBy { control -> control.tag }

    fun control(tag: String): ProbeControl? = controls[tag]

    fun mark(kind: String) {
        if (enabled) {
            marks.add(ProbeMark(SystemClock.elapsedRealtimeNanos(), kind))
            markCounter.incrementAndGet()
        }
    }

    fun marksCount(): Int = marks.size

    fun marksSince(since: Int): List<ProbeMark> =
        if (since <= 0) marks.toList() else marks.drop(since)

    fun clearMarks() {
        marks.clear()
    }

    fun anchor(): Long {
        anchorNanos = SystemClock.elapsedRealtimeNanos()
        return anchorNanos
    }
}

/**
 * Applies the tag and, in debug only, records the control's window bounds.
 *
 * Compose gives app code no way to walk its own semantics tree, so a control
 * can only be addressed if it registers itself. This is that registration, at
 * the point where the tag was already being applied.
 */
@Composable
fun Modifier.probeTag(tag: String, enabled: Boolean = true): Modifier {
    val tagged = this.testTag(tag)
    if (!Probe.enabled) {
        return tagged
    }
    val view = LocalView.current
    return tagged.onGloballyPositioned { coordinates ->
        val origin = IntArray(2)
        view.getLocationOnScreen(origin)
        val bounds = coordinates.boundsInRoot()
        Probe.record(
            ProbeControl(
                tag = tag,
                left = origin[0] + bounds.left.toInt(),
                top = origin[1] + bounds.top.toInt(),
                right = origin[0] + bounds.right.toInt(),
                bottom = origin[1] + bounds.bottom.toInt(),
                enabled = enabled,
            ),
        )
    }
}
