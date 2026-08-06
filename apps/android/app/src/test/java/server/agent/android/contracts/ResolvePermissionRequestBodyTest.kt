package server.agent.android.contracts

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ResolvePermissionRequestBodyTest {
    @Test
    fun encodesResolvedStatusEvenWhenUsingTheDefault() {
        val encoded = AgentServerJson.encodeToString(
            ResolvePermissionRequestBody.serializer(),
            ResolvePermissionRequestBody(optionId = "allow-once"),
        )

        assertTrue(encoded.contains("\"status\":\"resolved\""))
        assertTrue(encoded.contains("\"optionId\":\"allow-once\""))
        assertEquals(
            ResolvePermissionRequestBody(status = "resolved", optionId = "allow-once"),
            AgentServerJson.decodeFromString(ResolvePermissionRequestBody.serializer(), encoded),
        )
    }
}
