package harold.android.acp

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AcpHandshakeTest {
    @Test
    fun cursorDeclaresTheParameterizedModelPickerCapability() {
        val capabilities = acpInitializeParams("cursor").capabilities()

        assertEquals(
            true,
            capabilities.get("_meta")
                ?.jsonObject
                ?.get("parameterizedModelPicker")
                ?.jsonPrimitive
                ?.boolean,
        )
    }

    @Test
    fun otherAgentsDoNotDeclareTheCursorCapability() {
        assertNull(acpInitializeParams("claude").capabilities()["_meta"])
        assertNull(acpInitializeParams().capabilities()["_meta"])
    }

    private fun JsonObject.capabilities(): JsonObject =
        get("clientCapabilities")?.jsonObject
            ?: error("initialize params are missing clientCapabilities")
}
