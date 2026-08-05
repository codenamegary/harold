package server.agent.android.network

import okhttp3.Interceptor
import okhttp3.Response

/**
 * Attaches the paired device credential per RFC 6750. The credential only ever
 * travels in the `Authorization` header, never in a URL, and is never logged.
 */
class BearerAuthInterceptor(
    private val credential: () -> String?,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()

        if (request.header(AUTHORIZATION) != null) {
            return chain.proceed(request)
        }

        val value = credential()?.takeIf { it.isNotBlank() }
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
