package server.agent.android.chat

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import server.agent.android.contracts.EventEnvelope
import server.agent.android.contracts.EventType
import server.agent.android.contracts.PermissionOption
import server.agent.android.contracts.PermissionOptionKind
import server.agent.android.contracts.PermissionRequest
import server.agent.android.contracts.PermissionStatus

class PermissionEventsTest {
    @Test
    fun applyPermissionEventsAddsRequestedAndRemovesResolved() {
        val requested = permissionRequestedEvent(
            cursor = "1",
            requestId = "perm_01",
            occurredAt = "2026-08-06T00:00:00.000Z",
        )
        val resolved = permissionResolvedEvent(
            cursor = "2",
            requestId = "perm_01",
        )

        val afterRequest = applyPermissionEvents(emptyList(), listOf(requested))
        assertEquals(1, afterRequest.size)

        val afterResolve = applyPermissionEvents(afterRequest, listOf(resolved))
        assertTrue(afterResolve.isEmpty())
    }

    @Test
    fun applyPermissionEventsReplacesDuplicateRequestIds() {
        val first = permissionRequestedEvent(
            cursor = "1",
            requestId = "perm_01",
            toolName = "read",
            occurredAt = "2026-08-06T00:00:00.000Z",
        )
        val second = permissionRequestedEvent(
            cursor = "2",
            requestId = "perm_01",
            toolName = "write",
            occurredAt = "2026-08-06T00:00:01.000Z",
        )

        val pending = applyPermissionEvents(listOf(), listOf(first, second))

        assertEquals(1, pending.size)
        assertEquals("write", pending.single().toolName)
    }

    @Test
    fun mergePendingReadUsesAuthoritativeServerState() {
        val replayed = listOf(
            permissionRequest(
                id = "perm_old",
                createdAt = "2026-08-06T00:00:00.000Z",
            ),
        )
        val fromRead = listOf(
            permissionRequest(
                id = "perm_live",
                createdAt = "2026-08-06T00:00:01.000Z",
            ),
            permissionRequest(
                id = "perm_old",
                status = PermissionStatus.Resolved,
                createdAt = "2026-08-06T00:00:00.000Z",
            ),
        )

        val merged = mergePendingRead(replayed, fromRead)

        assertEquals(listOf("perm_live"), merged.map { item -> item.id })
    }

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

    private fun permissionRequestedEvent(
        cursor: String,
        requestId: String,
        toolName: String = "fake-tool",
        occurredAt: String,
        sessionId: String = "sess_01",
    ): EventEnvelope = EventEnvelope(
        type = EventType.SessionPermissionRequested,
        cursor = cursor,
        occurredAt = occurredAt,
        sessionId = sessionId,
        payload = buildJsonObject {
            put("requestId", JsonPrimitive(requestId))
            put("turnId", JsonPrimitive("turn_01"))
            put("toolCallId", JsonPrimitive("tool_01"))
            put("toolName", JsonPrimitive(toolName))
            put(
                "options",
                buildJsonArray {
                    addJsonObject {
                        put("optionId", JsonPrimitive("allow-once"))
                        put("name", JsonPrimitive("Allow once"))
                        put("kind", JsonPrimitive("allow"))
                    }
                    addJsonObject {
                        put("optionId", JsonPrimitive("reject-once"))
                        put("name", JsonPrimitive("Reject once"))
                        put("kind", JsonPrimitive("deny"))
                    }
                },
            )
        },
    )

    private fun permissionResolvedEvent(
        cursor: String,
        requestId: String,
        sessionId: String = "sess_01",
    ): EventEnvelope = EventEnvelope(
        type = EventType.SessionPermissionResolved,
        cursor = cursor,
        occurredAt = "2026-08-06T00:00:02.000Z",
        sessionId = sessionId,
        payload = buildJsonObject {
            put("requestId", JsonPrimitive(requestId))
            put("turnId", JsonPrimitive("turn_01"))
            put("toolCallId", JsonPrimitive("tool_01"))
            put("optionId", JsonPrimitive("allow-once"))
            put("outcome", JsonPrimitive("selected"))
        },
    )
}
