package server.agent.android.network

import kotlinx.coroutines.test.runTest
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

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class DefaultPairingApiTest {
    private lateinit var server: MockWebServer
    private lateinit var pairingApi: DefaultPairingApi

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        pairingApi = DefaultPairingApi()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun claimPostsDeviceNameAndPlatform() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(201)
                .setBody(
                    """
                    {
                      "device": {
                        "id": "device_01",
                        "name": "Google Pixel 8",
                        "platform": "android",
                        "state": "online",
                        "pairedAt": "2026-08-05T00:00:00.000Z",
                        "lastSeenAt": "2026-08-05T00:00:00.000Z"
                      },
                      "credential": "devcred_test_secret"
                    }
                    """.trimIndent(),
                ),
        )

        val result = pairingApi.claim(
            endpoint = server.url("/").toString().trimEnd('/'),
            code = "R7K-4MP",
            name = "Google Pixel 8",
            platform = "android",
        )

        val request = server.takeRequest()
        assertEquals("POST", request.method)
        assertTrue(request.path!!.endsWith("/v1/pairing-codes/R7K-4MP/claim"))
        assertTrue(request.body.readUtf8().contains("\"platform\":\"android\""))

        assertTrue(result.isSuccess)
        assertEquals("devcred_test_secret", result.getOrThrow().credential)
    }

    @Test
    fun claimMapsProblemDetails() = runTest {
        server.enqueue(
            MockResponse()
                .setResponseCode(409)
                .setBody(
                    """
                    {
                      "type": "https://agent-server.local/problems/conflict",
                      "title": "Pairing code already claimed",
                      "status": 409,
                      "detail": "Pairing code has already been claimed"
                    }
                    """.trimIndent(),
                ),
        )

        val result = pairingApi.claim(
            endpoint = server.url("/").toString().trimEnd('/'),
            code = "R7K-4MP",
            name = "Google Pixel 8",
            platform = "android",
        )

        assertTrue(result.isFailure)
        val error = result.exceptionOrNull() as PairingClaimException
        val problem = error.error as PairingClaimError.Problem
        assertEquals("Pairing code has already been claimed", problem.detail)
    }
}
