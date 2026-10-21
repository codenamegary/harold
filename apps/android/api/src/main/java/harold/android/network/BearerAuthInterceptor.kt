package harold.android.network

import okhttp3.HttpUrl
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Attaches the device credential for the Harold this request is calling, per
 * RFC 6750. The credential only ever travels in the `Authorization` header,
 * never in a URL, and is never logged.
 */
class BearerAuthInterceptor(
    private val credential: (HttpUrl) -> String?,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()

        if (request.header(AUTHORIZATION) != null) {
            return chain.proceed(request)
        }

        val value = credential(request.url)?.takeIf { it.isNotBlank() }
            ?: return chain.proceed(request)

        return chain.proceed(
            request.newBuilder()
                .header(AUTHORIZATION, "Bearer $value")
                .build(),
        )
    }

    private companion object {
        const val AUTHORIZATION = "Authorization"
    }
}
