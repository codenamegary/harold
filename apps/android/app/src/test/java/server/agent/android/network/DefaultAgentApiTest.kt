package server.agent.android.network

import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.CreateSessionBody
import server.agent.android.contracts.UpdateSessionBody
import server.agent.android.contracts.PermissionStatus
import server.agent.android.contracts.ResolvePermissionRequestBody
import server.agent.android.contracts.SessionState
import server.agent.android.contracts.WorkspaceState

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class DefaultAgentApiTest {
    private lateinit var server: MockWebServer
    private lateinit var agentApi: DefaultAgentApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        agentApi = DefaultAgentApi(
            client = OkHttpClient.Builder()
                .addInterceptor(BearerAuthInterceptor { "devcred_test_secret" })
                .build(),
        )
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun listWorkspacesSendsBearerAndDecodesCollection() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "items": [
                        {
                          "id": "ws_01",
                          "name": "agent-server",
                          "path": "/tmp/agent-server",
                          "state": "available",
                          "createdAt": "2026-08-05T00:00:00.000Z",
                          "lastUsedAt": "2026-08-05T01:00:00.000Z"
                        }
                      ],
                      "page": { "limit": 1, "count": 1, "nextCursor": "ws_01" }
                    }
                    """.trimIndent(),
                ),
        )

        val result = agentApi.listWorkspaces(serverOrigin = origin(), limit = 1)

        val recorded = server.takeRequest()
        assertEquals("GET", recorded.method)
        assertEquals("/v1/workspaces?limit=1", recorded.path)
        assertEquals("Bearer devcred_test_secret", recorded.getHeader("Authorization"))

        val collection = result.getOrThrow()
        assertEquals(1, collection.items.size)
        assertEquals(WorkspaceState.Available, collection.items.single().state)
    }

    @Test
    fun listWorkspacesDecodesEmptyCollection() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{ "items": [], "page": { "limit": 1, "count": 0 } }"""),
        )

        val collection = agentApi.listWorkspaces(serverOrigin = origin(), limit = 1).getOrThrow()

        assertTrue(collection.items.isEmpty())
    }

    @Test
    fun listWorkspacesMapsUnauthorized() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setBody(
                    """
                    {
                      "type": "https://agent-server.local/problems/unauthorized",
                      "title": "Unauthorized",
                      "status": 401,
                      "detail": "Authentication required"
                    }
                    """.trimIndent(),
                ),
        )

        val error = errorOf(agentApi.listWorkspaces(serverOrigin = origin(), limit = 1))

        assertEquals(AgentApiError.Unauthorized("Authentication required"), error)
    }

    @Test
    fun listWorkspacesMapsOtherProblemDetails() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(404)
                .setBody(
                    """
                    {
                      "type": "https://agent-server.local/problems/not-found",
                      "title": "Not found",
                      "status": 404
                    }
                    """.trimIndent(),
                ),
        )

        val error = errorOf(agentApi.listWorkspaces(serverOrigin = origin(), limit = 1))

        assertEquals(AgentApiError.Problem(status = 404, title = "Not found", detail = null), error)
    }

    @Test
    fun listWorkspacesFailsOnContractDrift() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{ "items": [], "page": { "limit": 1 }, "surprise": true }"""),
        )

        val error = errorOf(agentApi.listWorkspaces(serverOrigin = origin(), limit = 1))

        assertTrue("expected decode error but was $error", error is AgentApiError.Decode)
    }

    @Test
    fun listWorkspacesMapsTransportFailure() = runTest {
        server.shutdown()

        val error = errorOf(agentApi.listWorkspaces(serverOrigin = origin(), limit = 1))

        assertTrue("expected transport error but was $error", error is AgentApiError.Transport)
    }

    @Test
    fun listSessionsWithoutWorkspaceIdUsesGlobalEndpoint() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "items": [
                        {
                          "id": "sess_01",
                          "workspaceId": "ws_01",
                          "agentId": "cursor",
                          "name": "Debug",
                          "state": "idle",
                          "createdAt": "2026-08-05T00:00:00.000Z",
                          "lastUsedAt": "2026-08-05T01:00:00.000Z",
                          "archivedAt": null
                        }
                      ],
                      "page": { "limit": 100, "count": 1 }
                    }
                    """.trimIndent(),
                ),
        )

        val result = agentApi.listSessions(serverOrigin = origin())

        val recorded = server.takeRequest()
        assertEquals("/v1/sessions?limit=100", recorded.path)
        assertEquals(1, result.getOrThrow().items.size)
    }

    @Test
    fun createSessionPostsBody() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(201)
                .setBody(
                    """
                    {
                      "id": "sess_01",
                      "workspaceId": "ws_01",
                      "agentId": "cursor",
                      "name": "Ship it",
                      "state": "running",
                      "createdAt": "2026-08-05T00:00:00.000Z",
                      "lastUsedAt": "2026-08-05T00:00:00.000Z",
                      "archivedAt": null,
                      "turnId": "turn_01"
                    }
                    """.trimIndent(),
                ),
        )

        val result = agentApi.createSession(
            serverOrigin = origin(),
            body = CreateSessionBody(
                workspaceId = "ws_01",
                agentId = AgentId.Cursor,
                text = "Ship it",
            ),
        )

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/v1/sessions", recorded.path)
        assertTrue(recorded.body.readUtf8().contains("Ship it"))
        assertEquals("sess_01", result.getOrThrow().id)
    }

    @Test
    fun updateSessionPatchesName() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "id": "sess_01",
                      "workspaceId": "ws_01",
                      "agentId": "cursor",
                      "name": "Renamed",
                      "state": "idle",
                      "createdAt": "2026-08-05T00:00:00.000Z",
                      "lastUsedAt": "2026-08-05T01:00:00.000Z",
                      "archivedAt": null
                    }
                    """.trimIndent(),
                ),
        )

        val result = agentApi.updateSession(
            serverOrigin = origin(),
            sessionId = "sess_01",
            body = UpdateSessionBody(name = "Renamed"),
        )

        val recorded = server.takeRequest()
        assertEquals("PATCH", recorded.method)
        assertEquals("/v1/sessions/sess_01", recorded.path)
        assertEquals("Renamed", result.getOrThrow().name)
    }

    @Test
    fun cancelSessionPostsEmptyBody() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(202)
                .setBody("""{ "turnId": "turn_01" }"""),
        )

        val result = agentApi.cancelSession(serverOrigin = origin(), sessionId = "sess_01")

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/v1/sessions/sess_01/cancel", recorded.path)
        assertEquals("{}", recorded.body.readUtf8())
        assertEquals("turn_01", result.getOrThrow().turnId)
    }

    @Test
    fun archiveSessionPostsEmptyBody() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "id": "sess_01",
                      "workspaceId": "ws_01",
                      "agentId": "cursor",
                      "name": "Archived",
                      "state": "archived",
                      "createdAt": "2026-08-05T00:00:00.000Z",
                      "lastUsedAt": "2026-08-05T01:00:00.000Z",
                      "archivedAt": "2026-08-05T02:00:00.000Z"
                    }
                    """.trimIndent(),
                ),
        )

        val result = agentApi.archiveSession(serverOrigin = origin(), sessionId = "sess_01")

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/v1/sessions/sess_01/archive", recorded.path)
        assertEquals(SessionState.Archived, result.getOrThrow().state)
    }

    @Test
    fun listPendingPermissionsUsesStatusQuery() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "items": [
                        {
                          "id": "perm_01",
                          "sessionId": "sess_01",
                          "turnId": "turn_01",
                          "toolCallId": "tool_01",
                          "toolName": "fake-tool",
                          "status": "pending",
                          "options": [
                            { "optionId": "allow-once", "name": "Allow once", "kind": "allow" }
                          ],
                          "createdAt": "2026-08-06T00:00:00.000Z"
                        }
                      ],
                      "page": { "limit": 100, "count": 1 }
                    }
                    """.trimIndent(),
                ),
        )

        val result = agentApi.listPendingPermissions(serverOrigin = origin(), sessionId = "sess_01")

        val recorded = server.takeRequest()
        assertEquals("GET", recorded.method)
        assertEquals("/v1/sessions/sess_01/permissions?status=pending", recorded.path)
        assertEquals("perm_01", result.getOrThrow().items.single().id)
    }

    @Test
    fun resolvePermissionSendsPatchBody() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "id": "perm_01",
                      "sessionId": "sess_01",
                      "turnId": "turn_01",
                      "toolCallId": "tool_01",
                      "toolName": "fake-tool",
                      "status": "resolved",
                      "options": [
                        { "optionId": "allow-once", "name": "Allow once", "kind": "allow" }
                      ],
                      "createdAt": "2026-08-06T00:00:00.000Z"
                    }
                    """.trimIndent(),
                ),
        )

        val result = agentApi.resolvePermission(
            serverOrigin = origin(),
            sessionId = "sess_01",
            requestId = "perm_01",
            body = ResolvePermissionRequestBody(optionId = "allow-once"),
        )

        val recorded = server.takeRequest()
        assertEquals("PATCH", recorded.method)
        assertEquals("/v1/sessions/sess_01/permissions/perm_01", recorded.path)
        assertTrue(recorded.body.readUtf8().contains("\"optionId\":\"allow-once\""))
        assertEquals(
            PermissionStatus.Resolved,
            result.getOrThrow().status,
        )
    }

    private fun origin(): String = server.url("/").toString().trimEnd('/')

    private fun errorOf(result: Result<*>): AgentApiError =
        (result.exceptionOrNull() as AgentApiException).error
}
