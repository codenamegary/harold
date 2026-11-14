package harold.android.chat

/**
 * Registration point for the debug-only attachment fixture.
 *
 * The plan scene now films the real system photo and document pickers. This
 * debug seam remains for tests and for a fallback when a picker cannot be
 * filmed. A debug build installs a source here that produces the same
 * [AttachmentPick] values the pickers produce, and the `attach_fixture` probe
 * action feeds them through `ChatViewModel.onAttachmentsPicked`, the very method
 * the pickers call. The resulting chips and uploads are the app's real ones.
 *
 * Nothing in release ever assigns [source], so the field stays null there: the
 * probe does not advertise `attach_fixture` and the reader that touches device
 * storage is only compiled into the debug variant
 * (`chat/src/debug/java/harold/android/chat/ChatAttachmentFixtures.kt`).
 */
internal object ChatProbeAttachmentFixtures {
    @Volatile
    var source: (() -> List<AttachmentPick>)? = null
}
