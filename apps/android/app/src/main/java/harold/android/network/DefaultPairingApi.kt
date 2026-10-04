package harold.android.network

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class DefaultPairingApi(
    private val client: OkHttpClient = OkHttpClient(),
) : PairingApi {
    override suspend fun claim(
        endpoint: String,
        code: String,
        name: String,
        platform: String,
    ): Result<PairingClaimResult> = withContext(Dispatchers.IO) {
        try {
            val normalizedEndpoint = endpoint.trim().trimEnd('/')
            val claimUrl = "$normalizedEndpoint/v1/pairing-codes/$code/claim"
            val body = JSONObject()
                .put("name", name)
                .put("platform", platform)
                .toString()
                .toRequestBody(JSON_MEDIA_TYPE)

            val request = Request.Builder()
                .url(claimUrl)
                .post(body)
                .build()

            client.newCall(request).execute().use { response ->
                val responseBody = response.body?.string().orEmpty()

                if (!response.isSuccessful) {
                    val problem = runCatching { JSONObject(responseBody) }.getOrNull()

                    return@withContext Result.failure(
                        PairingClaimException(
                            PairingClaimError.Problem(
                                title = problem?.optString("title")?.takeIf { it.isNotBlank() }
                                    ?: "Pairing failed",
                                detail = problem?.optString("detail")?.takeIf { it.isNotBlank() },
                                status = response.code,
                            ),
                        ),
                    )
                }

                val json = JSONObject(responseBody)
                val device = json.getJSONObject("device")

                Result.success(
                    PairingClaimResult(
                        device = ClaimedDevice(
                            id = device.getString("id"),
                            name = device.getString("name"),
                            platform = device.optString("platform").takeIf { it.isNotBlank() },
                        ),
                        credential = json.getString("credential"),
                    ),
                )
            }
        } catch (error: PairingClaimException) {
            Result.failure(error)
        } catch (error: Throwable) {
            Result.failure(PairingClaimException(PairingClaimError.Transport(error)))
        }
    }
}

fun serverOriginFromEndpoint(endpoint: String): String {
    val uri = java.net.URI(endpoint.trim())
    val portSuffix = when {
        uri.port == -1 -> ""
        uri.scheme == "https" && uri.port == 443 -> ""
        uri.scheme == "http" && uri.port == 80 -> ""
        else -> ":${uri.port}"
    }

    return "${uri.scheme}://${uri.host}$portSuffix"
}

private val JSON_MEDIA_TYPE = "application/json".toMediaType()
