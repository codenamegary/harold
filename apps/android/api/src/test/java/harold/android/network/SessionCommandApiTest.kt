package harold.android.network

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
import harold.android.contracts.ExtensionReplyBody
import harold.android.contracts.HaroldJson
import harold.android.contracts.PromptRequestBody

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class SessionCommandApiTest {
    private lateinit var server: MockWebServer
    private lateinit var commands: DefaultAgentApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        commands = DefaultAgentApi(
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
    fun promptPostsToTheSessionPromptsPathAndAccepts202() = runTest {
        server.enqueue(MockResponse().setResponseCode(202))

        val result = commands.prompt(
            serverOrigin = origin(),
            agentId = "cursor",
            sessionId = "sess_01",
            body = PromptRequestBody(text = "Summarize this"),
        )

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/v1/sessions/sess_01/prompts?agentId=cursor", recorded.path)
        assertEquals("Bearer devcred_test_secret", recorded.getHeader("Authorization"))
        assertEquals("""{"text":"Summarize this"}""", recorded.body.readUtf8())
        assertTrue(result.isSuccess)
    }

    @Test
    fun promptSerializesAttachments() = runTest {
        server.enqueue(MockResponse().setResponseCode(202))

        commands.prompt(
            serverOrigin = origin(),
            agentId = "claude-code",
            sessionId = "sess_01",
            body = PromptRequestBody(
                text = "look",
                attachments = listOf(
                    harold.android.contracts.AttachmentReference(
                        kind = harold.android.contracts.AttachmentKind.Image,
                        name = "shot.png",
                        mimeType = "image/png",
                        path = "/ws/.harold/attachments/att_1.png",
                    ),
                ),
            ),
        ).getOrThrow()

        val recorded = server.takeRequest()
        assertTrue(recorded.body.readUtf8().contains("att_1.png"))
    }

    @Test
    fun promptMapsUnauthorizedToUnauthorized() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(401)
                .setBody("""{"type":"https://harold.local/problems/unauthorized","title":"Unauthorized","status":401}"""),
        )

        val result = commands.prompt(
            serverOrigin = origin(),
            agentId = "cursor",
            sessionId = "sess_01",
            body = PromptRequestBody(text = "hi"),
        )

        val error = (result.exceptionOrNull() as AgentApiException).error
        assertTrue("expected Unauthorized but was $error", error is AgentApiError.Unauthorized)
    }

    @Test
    fun promptMapsRejectedPromptToItsProblemStatus() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(422)
                .setBody(
                    """
                    {
                      "type": "https://harold.local/problems/session-command-rejected",
                      "title": "Command rejected",
                      "status": 422
                    }
                    """.trimIndent(),
                ),
        )

        val result = commands.prompt(
            serverOrigin = origin(),
            agentId = "cursor",
            sessionId = "sess_01",
            body = PromptRequestBody(text = "hi"),
        )

        val error = (result.exceptionOrNull() as AgentApiException).error
        assertEquals(422, (error as AgentApiError.Problem).status)
    }

    @Test
    fun cancelPostsToTheSessionCancelPathAndAccepts204() = runTest {
        server.enqueue(MockResponse().setResponseCode(204))

        val result = commands.cancel(
            serverOrigin = origin(),
            agentId = "cursor",
            sessionId = "sess_01",
        )

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/v1/sessions/sess_01/cancel?agentId=cursor", recorded.path)
        assertTrue(result.isSuccess)
    }

    @Test
    fun replyPermissionPostsTheOptionId() = runTest {
        server.enqueue(MockResponse().setResponseCode(204))

        val result = commands.replyPermission(
            serverOrigin = origin(),
            requestId = "perm_01",
            optionId = "allow-once",
        )

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/v1/permissions/perm_01/replies", recorded.path)
        assertEquals("""{"optionId":"allow-once"}""", recorded.body.readUtf8())
        assertTrue(result.isSuccess)
    }

    @Test
    fun replyPermissionMapsConflictToItsProblemStatus() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(409)
                .setBody(
                    """
                    {
                      "type": "https://harold.local/problems/permission-conflict",
                      "title": "Reply already settled",
                      "status": 409
                    }
                    """.trimIndent(),
                ),
        )

        val result = commands.replyPermission(
            serverOrigin = origin(),
            requestId = "perm_01",
            optionId = "allow-once",
        )

        val error = (result.exceptionOrNull() as AgentApiException).error
        assertEquals(409, (error as AgentApiError.Problem).status)
    }

    @Test
    fun replyExtensionPostsTheResult() = runTest {
        server.enqueue(MockResponse().setResponseCode(204))

        val result = commands.replyExtension(
            serverOrigin = origin(),
            requestId = "ext_01",
            result = kotlinx.serialization.json.JsonPrimitive("done"),
        )

        val recorded = server.takeRequest()
        assertEquals("POST", recorded.method)
        assertEquals("/v1/extensions/ext_01/replies", recorded.path)
        assertEquals(
            HaroldJson.encodeToString(
                ExtensionReplyBody.serializer(),
                ExtensionReplyBody(result = kotlinx.serialization.json.JsonPrimitive("done")),
            ),
            recorded.body.readUtf8(),
        )
        assertTrue(result.isSuccess)
    }

    private fun origin(): String = server.url("/").toString()
}
