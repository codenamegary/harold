package server.agent.android.contracts

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
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
              "deletable": false,
              "state": { "status": "stopped", "error": null },
              "capabilities": null,
              "authSummary": {
                "status": "needs_auth",
                "error": null,
                "activeSessionId": null,
                "canLogout": false
              }
            }
            """.trimIndent(),
        )

        assertEquals("cursor", settings.id)
        assertNull(settings.path)
        assertEquals(emptyList<String>(), settings.args)
        assertEquals(true, settings.present)
        assertEquals(true, settings.popular)
        assertEquals(false, settings.deletable)
        assertEquals(AgentRuntimeStatus.Stopped, settings.state.status)
        assertNull(settings.state.error)
        assertNull(settings.capabilities)
        assertEquals(AgentAuthStatus.NeedsAuth, settings.authSummary.status)
        assertEquals(false, settings.authSummary.canLogout)
    }

    @Test
    fun decodesAgentAuthWithV1Steps() {
        val auth = AgentServerJson.decodeFromString(
            AgentAuth.serializer(),
            """
            {
              "agentId": "claude",
              "status": "needs_auth",
              "error": null,
              "session": {
                "sessionId": "auth-1",
                "agentId": "claude",
                "status": "in_progress",
                "steps": [
                  { "type": "show_message", "level": "info", "body": "Sign in on the host" },
                  {
                    "type": "confirm",
                    "stepId": "confirm-1",
                    "title": "Ready?",
                    "body": "Finish login on the host",
                    "confirmLabel": "I have logged in"
                  },
                  { "type": "working", "label": "Checking…" },
                  { "type": "done", "outcome": "succeeded", "message": null }
                ],
                "error": null
              }
            }
            """.trimIndent(),
        )

        assertEquals("claude", auth.agentId)
        assertEquals(AgentAuthStatus.NeedsAuth, auth.status)
        val session = auth.session!!
        assertEquals(AuthSessionStatus.InProgress, session.status)
        assertEquals(4, session.steps.size)
        assertTrue(session.steps[0] is AuthStep.ShowMessage)
        assertTrue(session.steps[1] is AuthStep.Confirm)
        assertEquals("I have logged in", (session.steps[1] as AuthStep.Confirm).confirmLabel)
        assertTrue(session.steps[2] is AuthStep.Working)
        assertTrue(session.steps[3] is AuthStep.Done)
    }

    @Test
    fun decodesAgentAuthSummary() {
        val summary = AgentServerJson.decodeFromString(
            AgentAuthSummary.serializer(),
            """
            {
              "status": "authenticated",
              "error": null,
              "activeSessionId": null,
              "canLogout": true
            }
            """.trimIndent(),
        )

        assertEquals(AgentAuthStatus.Authenticated, summary.status)
        assertEquals(true, summary.canLogout)
        assertNull(summary.activeSessionId)
    }

    @Test
    fun decodesAuthSessionUpdatedStreamMessage() {
        val message = AgentServerJson.decodeFromString(
            SessionStreamServerMessage.serializer(),
            """
            {
              "type": "auth_session_updated",
              "agentId": "claude",
              "auth": {
                "agentId": "claude",
                "status": "needs_auth",
                "error": null,
                "session": {
                  "sessionId": "auth-1",
                  "agentId": "claude",
                  "status": "in_progress",
                  "steps": [
                    {
                      "type": "show_message",
                      "level": "info",
                      "body": "Sign in on the host"
                    }
                  ],
                  "error": null
                }
              }
            }
            """.trimIndent(),
        )

        val updated = message as SessionStreamServerMessage.AuthSessionUpdated
        assertEquals("claude", updated.agentId)
        assertEquals(AgentAuthStatus.NeedsAuth, updated.auth.status)
        assertEquals("auth-1", updated.auth.session?.sessionId)
    }

    @Test
    fun decodesSession() {
        val session = AgentServerJson.decodeFromString(
            Session.serializer(),
            """
            {
              "agentId": "claude",
              "sessionId": "sess_01",
              "cwd": "/tmp/agent-server",
              "title": "Fix the transport",
              "updatedAt": "2026-08-05T01:00:00.000Z"
            }
            """.trimIndent(),
        )

        assertEquals("claude", session.agentId)
        assertEquals("sess_01", session.sessionId)
        assertEquals("Fix the transport", session.title)
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

    @Test
    fun decodesSessionConfigStreamMessage() {
        val message = SessionStreamJson.decodeFromString(
            SessionStreamServerMessage.serializer(),
            """
            {
              "type": "session_config",
              "agentId": "cursor",
              "sessionId": "sess_01",
              "configOptions": [
                {
                  "id": "model",
                  "name": "Model",
                  "category": "model",
                  "type": "select",
                  "currentValue": "m1",
                  "options": [{ "value": "m1", "name": "M1" }]
                },
                {
                  "id": "thinking",
                  "name": "Thinking",
                  "type": "boolean",
                  "currentValue": true
                }
              ]
            }
            """.trimIndent(),
        )

        val config = message as SessionStreamServerMessage.SessionConfig
        assertEquals("cursor", config.agentId)
        assertEquals("sess_01", config.sessionId)
        assertEquals(2, config.configOptions.size)
        assertEquals(
            "model",
            config.configOptions.first().jsonObject.getValue("id").jsonPrimitive.content,
        )
    }

    @Test
    fun rejectsSessionConfigWithNonArrayConfigOptions() {
        assertThrowsSerialization {
            SessionStreamJson.decodeFromString(
                SessionStreamServerMessage.serializer(),
                """
                {
                  "type": "session_config",
                  "agentId": "cursor",
                  "sessionId": "sess_01",
                  "configOptions": { "id": "model" }
                }
                """.trimIndent(),
            )
        }
    }

    private fun assertThrowsSerialization(block: () -> Unit) {
        val thrown = runCatching(block).exceptionOrNull()

        assertTrue(
            "expected SerializationException but was $thrown",
            thrown is SerializationException,
        )
    }
}
