package harold.android.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import harold.android.contracts.PermissionOption
import harold.android.contracts.PermissionOptionKind
import harold.android.contracts.PermissionRequest
import harold.android.contracts.PermissionStatus

class PermissionEventsTest {
    @Test
    fun activePermissionRequestReturnsOldestPending() {
        val pending = listOf(
            permissionRequest(id = "perm_02", createdAt = "2026-08-06T00:00:02.000Z"),
            permissionRequest(id = "perm_01", createdAt = "2026-08-06T00:00:01.000Z"),
        )

        assertEquals("perm_01", activePermissionRequest(pending)?.id)
    }

    @Test
    fun activePermissionRequestIgnoresResolvedItems() {
        val pending = listOf(
            permissionRequest(
                id = "perm_01",
                status = PermissionStatus.Resolved,
                createdAt = "2026-08-06T00:00:01.000Z",
            ),
        )

        assertNull(activePermissionRequest(pending))
    }

    private fun permissionRequest(
        id: String,
        status: PermissionStatus = PermissionStatus.Pending,
        createdAt: String,
    ): PermissionRequest = PermissionRequest(
        id = id,
        sessionId = "sess_01",
        turnId = "turn_01",
        toolCallId = "tool_01",
        toolName = "fake-tool",
        status = status,
        options = listOf(
            PermissionOption(
                optionId = "allow-once",
                name = "Allow once",
                kind = PermissionOptionKind.Allow,
            ),
        ),
        createdAt = createdAt,
    )
}
