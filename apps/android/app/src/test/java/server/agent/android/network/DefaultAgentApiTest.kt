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
import server.agent.android.contracts.AgentAuthStatus
import server.agent.android.contracts.AuthSessionAction
import server.agent.android.contracts.AuthSessionStatus
import server.agent.android.contracts.ConfigValue
import server.agent.android.contracts.CreateSessionBody
import server.agent.android.contracts.CreateWorkspaceBody
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
    fun listSessionsUsesGatewayCollection() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "items": [
                        {
                          "agentId": "cursor",
                          "sessionId": "sess_01",
                          "cwd": "/tmp/agent-server",
                          "title": "Debug",
                          "updatedAt": "2026-08-05T01:00:00.000Z"
                        }
                      ]
                    }
                    """.trimIndent(),
                ),
        )

        val result = agentApi.listSessions(serverOrigin = origin())

        val recorded = server.takeRequest()
        assertEquals("/v1/sessions", recorded.path)
        val item = result.getOrThrow().items.single()
        assertEquals("sess_01", item.sessionId)
        assertEquals("Debug", item.title)
    }

    @Test
    fun listSessionsIncludesCwdFilter() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody("""{ "items": [] }"""),
        )

        agentApi.listSessions(serverOrigin = origin(), cwd = "/tmp/agent-server")

        val recorded = server.takeRequest()
        assertEquals("/v1/sessions?cwd=%2Ftmp%2Fagent-server", recorded.path)
    }

    @Test
    fun createSessionPostsAgentIdAndCwd() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(201)
                .setBody(
                    """
                    {
                      "agentId": "cursor",
                      "sessionId": "sess_01",
                      "cwd": "/tmp/agent-server",
                      "title": "New session",
                      "updatedAt": "2026-08-05T00:00:00.000Z"
                    }
                    """.trimIndent(),
                ),
        )

        val result = agentApi.createSession(
            serverOrigin = origin(),
            body = CreateSessionBody(
                agentId = "cursor",
                cwd = "/tmp/agent-server",
            ),
        )

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/v1/sessions", recorded.path)
        assertTrue(recorded.body.readUtf8().contains("/tmp/agent-server"))
        assertEquals("sess_01", result.getOrThrow().sessionId)
    }

    @Test
    fun deleteSessionSendsAgentIdQuery() = runTest {
        server.enqueue(MockResponse().setResponseCode(204))

        val result = agentApi.deleteSession(
            serverOrigin = origin(),
            agentId = "cursor",
            sessionId = "sess_01",
        )

        val recorded = server.takeRequest()
        assertEquals("DELETE", recorded.method)
        assertEquals("/v1/sessions/sess_01?agentId=cursor", recorded.path)
        assertTrue(result.isSuccess)
    }

    @Test
    fun deleteSessionMapsConflictProblem() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(409)
                .setBody(
                    """
                    {
                      "type": "https://agent-server.local/problems/conflict",
                      "title": "Conflict",
                      "status": 409,
                      "detail": "Agent is disabled"
                    }
                    """.trimIndent(),
                ),
        )

        val error = errorOf(
            agentApi.deleteSession(
                serverOrigin = origin(),
                agentId = "cursor",
                sessionId = "sess_01",
            ),
        )

        assertEquals(
            AgentApiError.Problem(
                status = 409,
                title = "Conflict",
                detail = "Agent is disabled",
            ),
            error,
        )
    }

    @Test
    fun setConfigOptionPutsTextValueWithAgentIdQuery() = runTest {
        server.enqueue(MockResponse().setResponseCode(202))

        val result = agentApi.setConfigOption(
            serverOrigin = origin(),
            agentId = "cursor",
            sessionId = "sess_01",
            configId = "model",
            value = ConfigValue.Text("m2"),
        )

        val recorded = server.takeRequest()
        assertEquals("PUT", recorded.method)
        assertEquals(
            "/v1/sessions/sess_01/config-options/model?agentId=cursor",
            recorded.path,
        )
        assertEquals("""{"value":"m2"}""", recorded.body.readUtf8())
        assertTrue(result.isSuccess)
    }

    @Test
    fun setConfigOptionPutsBooleanValue() = runTest {
        server.enqueue(MockResponse().setResponseCode(202))

        val result = agentApi.setConfigOption(
            serverOrigin = origin(),
            agentId = "cursor",
            sessionId = "sess_01",
            configId = "thinking",
            value = ConfigValue.Toggle(true),
        )

        val recorded = server.takeRequest()
        assertEquals("""{"value":true}""", recorded.body.readUtf8())
        assertTrue(result.isSuccess)
    }

    @Test
    fun setConfigOptionMapsValidationProblem() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(422)
                .setBody(
                    """
                    {
                      "type": "https://agent-server.local/problems/validation-error",
                      "title": "Config option rejected",
                      "status": 422,
                      "code": "validation.configOption.invalid",
                      "errors": [
                        { "pointer": "#/value", "code": "validation.configOption.invalid" }
                      ]
                    }
                    """.trimIndent(),
                ),
        )

        val error = errorOf(
            agentApi.setConfigOption(
                serverOrigin = origin(),
                agentId = "cursor",
                sessionId = "sess_01",
                configId = "model",
                value = ConfigValue.Text("m2"),
            ),
        )

        assertEquals(
            AgentApiError.Problem(
                status = 422,
                title = "Config option rejected",
                detail = null,
            ),
            error,
        )
    }

    @Test
    fun getRuntimeSettingsDecodesAllowedRoots() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
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
                ),
        )

        val view = agentApi.getRuntimeSettings(serverOrigin = origin()).getOrThrow()

        val recorded = server.takeRequest()
        assertEquals("GET", recorded.method)
        assertEquals("/v1/settings/runtime", recorded.path)
        assertEquals(listOf("/home/ops/code"), view.settings.allowedRoots)
    }

    @Test
    fun listFilesystemDirectoriesSendsRootQuery() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "items": [
                        { "name": "agent-server", "path": "/home/ops/code/agent-server" }
                      ]
                    }
                    """.trimIndent(),
                ),
        )

        val collection = agentApi.listFilesystemDirectories(
            serverOrigin = origin(),
            root = "/home/ops/code",
        ).getOrThrow()

        val recorded = server.takeRequest()
        assertEquals("/v1/filesystem/directories?root=%2Fhome%2Fops%2Fcode", recorded.path)
        assertEquals(1, collection.items.size)
        assertEquals("agent-server", collection.items.single().name)
    }

    @Test
    fun createWorkspacePostsNameAndPath() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(201)
                .setBody(
                    """
                    {
                      "id": "ws_01",
                      "name": "agent-server",
                      "path": "/home/ops/code/agent-server",
                      "state": "available",
                      "createdAt": "2026-08-10T00:00:00.000Z",
                      "lastUsedAt": "2026-08-10T00:00:00.000Z"
                    }
                    """.trimIndent(),
                ),
        )

        val workspace = agentApi.createWorkspace(
            serverOrigin = origin(),
            body = CreateWorkspaceBody(
                name = "agent-server",
                path = "/home/ops/code/agent-server",
            ),
        ).getOrThrow()

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/v1/workspaces", recorded.path)
        assertTrue(recorded.body.readUtf8().contains("\"path\":\"/home/ops/code/agent-server\""))
        assertEquals("ws_01", workspace.id)
    }

    @Test
    fun getAgentAuthDecodesPayload() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "agentId": "claude",
                      "status": "needs_auth",
                      "error": null,
                      "session": null
                    }
                    """.trimIndent(),
                ),
        )

        val auth = agentApi.getAgentAuth(serverOrigin = origin(), agentId = "claude").getOrThrow()

        val recorded = server.takeRequest()
        assertEquals("GET", recorded.method)
        assertEquals("/v1/agents/claude/auth", recorded.path)
        assertEquals("claude", auth.agentId)
        assertEquals(AgentAuthStatus.NeedsAuth, auth.status)
    }

    @Test
    fun startAgentAuthSessionPostsEmptyBody() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "sessionId": "auth-1",
                      "agentId": "claude",
                      "status": "in_progress",
                      "steps": [
                        { "type": "show_message", "level": "info", "body": "Sign in on the host" }
                      ],
                      "error": null
                    }
                    """.trimIndent(),
                ),
        )

        val session = agentApi.startAgentAuthSession(
            serverOrigin = origin(),
            agentId = "claude",
        ).getOrThrow()

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/v1/agents/claude/auth/sessions", recorded.path)
        assertEquals("{}", recorded.body.readUtf8())
        assertEquals("auth-1", session.sessionId)
    }

    @Test
    fun applyAgentAuthSessionActionPostsConfirm() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "sessionId": "auth-1",
                      "agentId": "claude",
                      "status": "in_progress",
                      "steps": [
                        { "type": "working", "label": "Checking…" }
                      ],
                      "error": null
                    }
                    """.trimIndent(),
                ),
        )

        val session = agentApi.applyAgentAuthSessionAction(
            serverOrigin = origin(),
            agentId = "claude",
            sessionId = "auth-1",
            action = AuthSessionAction.Confirm(stepId = "confirm-1"),
        ).getOrThrow()

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/v1/agents/claude/auth/sessions/auth-1/actions", recorded.path)
        assertTrue(recorded.body.readUtf8().contains("\"type\":\"confirm\""))
        assertEquals(AuthSessionStatus.InProgress, session.status)
    }

    @Test
    fun logoutAgentAuthPostsEmptyBody() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(200)
                .setBody(
                    """
                    {
                      "status": "needs_auth",
                      "error": null,
                      "activeSessionId": null,
                      "canLogout": false
                    }
                    """.trimIndent(),
                ),
        )

        val summary = agentApi.logoutAgentAuth(
            serverOrigin = origin(),
            agentId = "claude",
        ).getOrThrow()

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/v1/agents/claude/auth/logout", recorded.path)
        assertEquals("{}", recorded.body.readUtf8())
        assertEquals(AgentAuthStatus.NeedsAuth, summary.status)
    }

    private fun origin(): String = server.url("/").toString().trimEnd('/')

    private fun errorOf(result: Result<*>): AgentApiError =
        (result.exceptionOrNull() as AgentApiException).error
}
