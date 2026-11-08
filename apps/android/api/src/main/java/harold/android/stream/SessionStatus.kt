package harold.android.stream

/**
 * Live state of one ACP session. The stream and the command API share the
 * same session object, so the UI can tell a running turn from a detached or
 * dead session without decoding transcript frames.
 */
enum class SessionStatus {
    Starting,
    Reloading,
    Ready,
    Running,
    AwaitingPermission,
    AwaitingAnswer,
    Offline,
    AuthFailed,
    Error,
}
