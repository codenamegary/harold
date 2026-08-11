package server.agent.android.contracts

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ContractDecodingTest {
    @Test
    fun decodesWorkspace() {
        val workspace = AgentServerJson.decodeFromString(
            Workspace.serializer(),
            """
            {
              "id": "ws_01",
              "name": "agent-server",
              "path": "/home/operator/sites/agent-server",
              "state": "available",
              "createdAt": "2026-08-05T00:00:00.000Z",
              "lastUsedAt": "2026-08-05T01:00:00.000Z"
            }
            """.trimIndent(),
        )

        assertEquals("ws_01", workspace.id)
        assertEquals(WorkspaceState.Available, workspace.state)
    }

    @Test
    fun rejectsWorkspaceWithUnknownKey() {
        assertThrowsSerialization {
            AgentServerJson.decodeFromString(
                Workspace.serializer(),
                """
                {
                  "id": "ws_01",
                  "name": "agent-server",
                  "path": "/tmp/agent-server",
                  "state": "available",
                  "createdAt": "2026-08-05T00:00:00.000Z",
                  "lastUsedAt": "2026-08-05T01:00:00.000Z",
                  "unexpected": true
                }
                """.trimIndent(),
            )
        }
    }

    @Test
    fun rejectsUnknownWorkspaceState() {
        assertThrowsSerialization {
            AgentServerJson.decodeFromString(
                Workspace.serializer(),
                """
                {
                  "id": "ws_01",
                  "name": "agent-server",
                  "path": "/tmp/agent-server",
                  "state": "sideways",
                  "createdAt": "2026-08-05T00:00:00.000Z",
                  "lastUsedAt": "2026-08-05T01:00:00.000Z"
                }
                """.trimIndent(),
            )
        }
    }

    @Test
    fun decodesAgentSettings() {
        val settings = AgentServerJson.decodeFromString(
            AgentSettings.serializer(),
            """
            {
              "id": "cursor",
              "displayName": "Cursor",
              "available": true,
              "enabled": false,
              "path": null,
              "args": [],
              "present": true,
              "popular": true,
              "deletable": false
            }
            """.trimIndent(),
        )

        assertEquals("cursor", settings.id)
        assertNull(settings.path)
        assertEquals(emptyList<String>(), settings.args)
        assertEquals(true, settings.present)
        assertEquals(true, settings.popular)
        assertEquals(false, settings.deletable)
    }

    @Test
    fun decodesSession() {
        val session = AgentServerJson.decodeFromString(
            Session.serializer(),
            """
            {
              "id": "sess_01",
              "workspaceId": "ws_01",
              "agentId": "claude",
              "name": "Fix the transport",
              "state": "awaiting-permission",
              "createdAt": "2026-08-05T00:00:00.000Z",
              "lastUsedAt": "2026-08-05T01:00:00.000Z",
              "archivedAt": null
            }
            """.trimIndent(),
        )

        assertEquals("claude", session.agentId)
        assertEquals(SessionState.AwaitingPermission, session.state)
        assertNull(session.archivedAt)
    }

    @Test
    fun decodesWorkspaceCollectionWithPageInfo() {
        val collection = AgentServerJson.decodeFromString(
            ItemCollection.serializer(Workspace.serializer()),
            """
            {
              "items": [
                {
                  "id": "ws_01",
                  "name": "agent-server",
                  "path": "/tmp/agent-server",
                  "state": "missing",
                  "createdAt": "2026-08-05T00:00:00.000Z",
                  "lastUsedAt": "2026-08-05T01:00:00.000Z"
                }
              ],
              "page": { "limit": 1, "nextCursor": "ws_01", "count": 1 }
            }
            """.trimIndent(),
        )

        assertEquals(1, collection.items.size)
        assertEquals(WorkspaceState.Missing, collection.items.single().state)
        assertEquals(1, collection.page.limit)
        assertEquals("ws_01", collection.page.nextCursor)
        assertNull(collection.page.previousCursor)
    }

    @Test
    fun decodesEmptyCollection() {
        val collection = AgentServerJson.decodeFromString(
            ItemCollection.serializer(Workspace.serializer()),
            """{ "items": [], "page": { "limit": 1 } }""",
        )

        assertTrue(collection.items.isEmpty())
        assertNull(collection.page.count)
    }

    @Test
    fun decodesUnauthorizedProblem() {
        val problem = AgentServerJson.decodeFromString(
            ProblemDetails.serializer(),
            """
            {
              "type": "https://agent-server.local/problems/unauthorized",
              "title": "Unauthorized",
              "status": 401,
              "detail": "Authentication required"
            }
            """.trimIndent(),
        )

        assertTrue(problem is UnauthorizedProblem)
        assertEquals("Unauthorized", problem.title)
        assertEquals(401, problem.status)
    }

    @Test
    fun decodesValidationProblemWithErrors() {
        val problem = AgentServerJson.decodeFromString(
            ProblemDetails.serializer(),
            """
            {
              "type": "https://agent-server.local/problems/validation-error",
              "title": "Validation failed",
              "status": 400,
              "code": "invalid_query",
              "errors": [{ "pointer": "/limit", "code": "too_big" }]
            }
            """.trimIndent(),
        )

        val validation = problem as ValidationProblem
        assertEquals("invalid_query", validation.code)
        assertEquals("/limit", validation.errors.single().pointer)
    }

    @Test
    fun rejectsUnknownProblemType() {
        assertThrowsSerialization {
            AgentServerJson.decodeFromString(
                ProblemDetails.serializer(),
                """{ "type": "https://agent-server.local/problems/teapot", "title": "Nope" }""",
            )
        }
    }

    @Test
    fun decodesEventFrameEnvelopes() {
        val frame = AgentServerJson.decodeFromString(
            EventFrameSerializer,
            """
            [
              {
                "type": "server.status",
                "cursor": "1",
                "occurredAt": "2026-08-05T00:00:00.000Z",
                "payload": { "state": "online" }
              },
              {
                "type": "session.output.delta",
                "cursor": "2",
                "occurredAt": "2026-08-05T00:00:01.000Z",
                "workspaceId": "ws_01",
                "sessionId": "sess_01",
                "payload": { "turnId": "turn_01K1ZQ4T7C8E9FGHJKMNPQRSTV", "text": "hi" }
              }
            ]
            """.trimIndent(),
        )

        assertEquals(2, frame.size)
        assertEquals(EventType.ServerStatus, frame.first().type)
        assertEquals("1", frame.first().cursor)
        assertNull(frame.first().sessionId)

        val delta = frame.last()
        assertEquals(EventType.SessionOutputDelta, delta.type)
        assertEquals("sess_01", delta.sessionId)
        assertEquals(JsonPrimitive("hi"), delta.payload["text"])
    }

    @Test
    fun rejectsUnknownEventType() {
        assertThrowsSerialization {
            AgentServerJson.decodeFromString(
                EventFrameSerializer,
                """
                [
                  {
                    "type": "session.telepathy",
                    "cursor": "1",
                    "occurredAt": "2026-08-05T00:00:00.000Z",
                    "payload": {}
                  }
                ]
                """.trimIndent(),
            )
        }
    }

    @Test
    fun rejectsEventEnvelopeWithUnknownKey() {
        assertThrowsSerialization {
            AgentServerJson.decodeFromString(
                EventEnvelope.serializer(),
                """
                {
                  "type": "server.status",
                  "cursor": "1",
                  "occurredAt": "2026-08-05T00:00:00.000Z",
                  "payload": { "state": "online" },
                  "extra": 1
                }
                """.trimIndent(),
            )
        }
    }

    @Test
    fun decodesRuntimeSettingsView() {
        val view = AgentServerJson.decodeFromString(
            RuntimeSettingsView.serializer(),
            """
            {
              "settings": {
                "advertisedUrl": null,
                "trustedProxies": [],
                "bindHost": "127.0.0.1",
                "bindPort": 3847,
                "logLevel": "info",
                "logPath": null,
                "allowedRoots": ["/home/ops/code"]
              },
              "restartRequired": false,
              "effective": {
                "bindHost": "127.0.0.1",
                "bindPort": 3847,
                "logPath": null
              },
              "overrides": {}
            }
            """.trimIndent(),
        )

        assertEquals(listOf("/home/ops/code"), view.settings.allowedRoots)
        assertEquals(LogLevel.Info, view.settings.logLevel)
    }

    @Test
    fun decodesFilesystemDirectoryCollection() {
        val collection = AgentServerJson.decodeFromString(
            FilesystemDirectoryCollection.serializer(),
            """
            {
              "items": [
                { "name": "agent-server", "path": "/home/ops/code/agent-server" }
              ]
            }
            """.trimIndent(),
        )

        assertEquals(1, collection.items.size)
        assertEquals("agent-server", collection.items.single().name)
    }

    private fun assertThrowsSerialization(block: () -> Unit) {
        val thrown = runCatching(block).exceptionOrNull()

        assertTrue(
            "expected SerializationException but was $thrown",
            thrown is SerializationException,
        )
    }
}
