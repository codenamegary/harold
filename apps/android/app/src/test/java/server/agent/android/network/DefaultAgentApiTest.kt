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

    private fun origin(): String = server.url("/").toString().trimEnd('/')

    private fun errorOf(result: Result<*>): AgentApiError =
        (result.exceptionOrNull() as AgentApiException).error
}
