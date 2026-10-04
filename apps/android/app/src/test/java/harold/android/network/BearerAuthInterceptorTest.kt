package harold.android.network

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class BearerAuthInterceptorTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun attachesBearerCredentialWithoutLeakingItIntoTheUrl() {
        val client = clientWith { "devcred_test_secret" }
        server.enqueue(MockResponse().setResponseCode(204))

        client.newCall(Request.Builder().url(server.url("/v1/workspaces?limit=1")).build())
            .execute()
            .close()

        val recorded = server.takeRequest()
        assertEquals("Bearer devcred_test_secret", recorded.getHeader("Authorization"))
        assertFalse(recorded.path!!.contains("devcred_test_secret"))
    }

    @Test
    fun omitsHeaderWhenNoCredentialIsStored() {
        val client = clientWith { null }
        server.enqueue(MockResponse().setResponseCode(204))

        client.newCall(Request.Builder().url(server.url("/v1/workspaces")).build())
            .execute()
            .close()

        assertNull(server.takeRequest().getHeader("Authorization"))
    }

    @Test
    fun keepsAnExplicitAuthorizationHeader() {
        val client = clientWith { "devcred_test_secret" }
        server.enqueue(MockResponse().setResponseCode(204))

        client.newCall(
            Request.Builder()
                .url(server.url("/v1/workspaces"))
                .header("Authorization", "Bearer explicit")
                .build(),
        ).execute().close()

        assertEquals("Bearer explicit", server.takeRequest().getHeader("Authorization"))
    }

    private fun clientWith(credential: () -> String?): OkHttpClient =
        OkHttpClient.Builder()
            .addInterceptor(BearerAuthInterceptor(credential))
            .build()
}
