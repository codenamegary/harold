package harold.android.transport.ssh

/**
 * A borrowed handle to a pooled SSH connection. Closing the lease only
 * releases the reference; the shared connection stays open for other callers.
 */
interface SshConnectionLease : SshConnection {
    val key: String
}
