package harold.android.live

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ElicitationTest {
    private fun form(params: JsonObject, requestId: String = "req-1"): Elicitation.Form =
        parseElicitation(
            requestId = requestId,
            agentId = "opencode",
            sessionId = "sess-1",
            params = params,
        ) as Elicitation.Form

    private fun objectSchema(
        properties: JsonObject,
        required: List<String> = emptyList(),
    ): JsonObject = JsonObject(
        mapOf(
            "mode" to JsonPrimitive("form"),
            "sessionId" to JsonPrimitive("sess-1"),
            "message" to JsonPrimitive("Questions"),
            "requestedSchema" to JsonObject(
                mapOf(
                    "type" to JsonPrimitive("object"),
                    "properties" to properties,
                    "required" to JsonArray(required.map { JsonPrimitive(it) }),
                ),
            ),
        ),
    )

    private fun select(options: List<String>): JsonObject = JsonObject(
        mapOf(
            "type" to JsonPrimitive("string"),
            "oneOf" to JsonArray(
                options.map { JsonObject(mapOf("const" to JsonPrimitive(it), "title" to JsonPrimitive(it))) },
            ),
        ),
    )

    private fun text(default: String? = null): JsonObject = JsonObject(
        buildMap {
            put("type", JsonPrimitive("string"))
            if (default != null) {
                put("default", JsonPrimitive(default))
            }
        },
    )

    @Test
    fun parsesOpenCodeStyleQuestionsAndPairsTheCustomField() {
        val elicitation = form(
            objectSchema(
                JsonObject(
                    mapOf(
                        "q0" to select(listOf("bun", "npm")),
                        "q0_custom" to text(),
                    ),
                ),
            ),
        )

        assertEquals(1, elicitation.questions.size)
        val question = elicitation.questions.single()
        assertEquals("q0", question.key)
        assertEquals("q0_custom", question.otherKey)
        assertFalse(question.required)
        assertEquals(
            listOf(ElicitationOption("bun", "bun"), ElicitationOption("npm", "npm")),
            (question.kind as ElicitationKind.SingleSelect).options,
        )
    }

    @Test
    fun pairsTheCustomFieldOfAMultiSelectQuestion() {
        val elicitation = form(
            objectSchema(
                JsonObject(
                    mapOf(
                        "features" to JsonObject(
                            mapOf(
                                "type" to JsonPrimitive("array"),
                                "items" to JsonObject(
                                    mapOf(
                                        "anyOf" to JsonArray(
                                            listOf(
                                                JsonObject(
                                                    mapOf(
                                                        "const" to JsonPrimitive("a"),
                                                        "title" to JsonPrimitive("A"),
                                                    ),
                                                ),
                                            ),
                                        ),
                                    ),
                                ),
                            ),
                        ),
                        "features_custom" to text(),
                    ),
                ),
            ),
        )

        val question = elicitation.questions.single()
        assertEquals("features_custom", question.otherKey)
        assertEquals(
            ElicitationKind.MultiSelect(listOf(ElicitationOption("a", "A"))),
            question.kind,
        )
    }

    @Test
    fun skipsUnknownOptionalTypesAndFallsBackOnUnknownRequiredTypes() {
        val optional = form(
            objectSchema(
                JsonObject(
                    mapOf(
                        "known" to text(),
                        "mystery" to JsonObject(mapOf("type" to JsonPrimitive("range"))),
                    ),
                ),
            ),
        )
        assertEquals(listOf("known"), optional.questions.map { it.key })

        val required = parseElicitation(
            requestId = "req-2",
            agentId = "opencode",
            sessionId = "sess-1",
            params = objectSchema(
                JsonObject(mapOf("mystery" to JsonObject(mapOf("type" to JsonPrimitive("range"))))),
                required = listOf("mystery"),
            ),
        )
        assertTrue(required is Elicitation.Unsupported)
    }

    @Test
    fun validationRequiresAnOtherAnswerForARequiredSingleSelect() {
        val question = ElicitationQuestion(
            key = "q0",
            title = "Package Manager",
            description = null,
            required = true,
            kind = ElicitationKind.SingleSelect(listOf(ElicitationOption("bun", "bun"))),
            otherKey = "q0_custom",
        )

        val unanswered = ElicitationDraft.fromQuestions(listOf(question))
        assertFalse(unanswered.isQuestionValid(question))

        val otherWithoutText = unanswered.withSingle("q0", OTHER_OPTION_VALUE)
        assertFalse(otherWithoutText.isQuestionValid(question))

        val otherWithText = otherWithoutText.withOtherText("q0", "pnpm")
        assertTrue(otherWithText.isQuestionValid(question))
        assertEquals(
            JsonObject(mapOf("q0_custom" to JsonPrimitive("pnpm"))),
            otherWithText.toContent(listOf(question)),
        )
    }

    @Test
    fun omitsUnansweredFieldsAndSendsTheMultiSelectBaseArrayPlusCustom() {
        val multi = ElicitationQuestion(
            key = "features",
            title = "Features",
            description = null,
            required = false,
            kind = ElicitationKind.MultiSelect(
                listOf(
                    ElicitationOption("a", "A"),
                    ElicitationOption("b", "B"),
                ),
            ),
            otherKey = "features_custom",
        )
        val freeText = ElicitationQuestion(
            key = "notes",
            title = "Notes",
            description = null,
            required = false,
            kind = ElicitationKind.Text(),
        )

        val draft = ElicitationDraft.fromQuestions(listOf(multi, freeText))
            .toggleMulti("features", "a")
            .withOtherSelected("features", true)
            .withOtherText("features", "custom")

        assertEquals(
            JsonObject(
                mapOf(
                    "features" to JsonArray(listOf(JsonPrimitive("a"))),
                    "features_custom" to JsonPrimitive("custom"),
                ),
            ),
            draft.toContent(listOf(multi, freeText)),
        )
    }

    @Test
    fun prefillsSchemaDefaults() {
        val question = ElicitationQuestion(
            key = "answer",
            title = "Answer",
            description = null,
            required = false,
            kind = ElicitationKind.Text(),
        )
        val params = objectSchema(
            JsonObject(
                mapOf(
                    "answer" to JsonObject(
                        mapOf(
                            "type" to JsonPrimitive("string"),
                            "default" to JsonPrimitive("hello"),
                        ),
                    ),
                ),
            ),
        )

        val elicitation = form(params)
        val draft = ElicitationDraft.fromQuestions(elicitation.questions)
        assertEquals(JsonPrimitive("hello"), elicitation.questions.single().defaultValue)
        assertEquals("hello", draft.textFor("answer"))
        assertTrue(question.required.not())
    }

    @Test
    fun parsesUrlModeAndFlagsInsecureAndPunycodeHosts() {
        fun urlElicitation(url: String): Elicitation = parseElicitation(
            requestId = "req-url",
            agentId = "opencode",
            sessionId = "sess-1",
            params = JsonObject(
                mapOf(
                    "mode" to JsonPrimitive("url"),
                    "sessionId" to JsonPrimitive("sess-1"),
                    "elicitationId" to JsonPrimitive("url-1"),
                    "url" to JsonPrimitive(url),
                    "message" to JsonPrimitive("Authorize"),
                ),
            ),
        )

        val secure = urlElicitation("https://example.com/connect") as Elicitation.Url
        assertEquals("example.com", secure.host)
        assertEquals(false, analyzeElicitationUrl(secure.url)!!.insecure)
        assertEquals(false, analyzeElicitationUrl(secure.url)!!.punycode)

        val insecure = urlElicitation("http://example.com/connect")
        assertTrue(analyzeElicitationUrl((insecure as Elicitation.Url).url)!!.insecure)

        val punycode = urlElicitation("https://xn--80ak6aa92e.com/connect")
        assertTrue(analyzeElicitationUrl((punycode as Elicitation.Url).url)!!.punycode)

        assertTrue(urlElicitation("ftp://example.com/connect") is Elicitation.Unsupported)
        assertTrue(urlElicitation("not a url") is Elicitation.Unsupported)
    }

    @Test
    fun unknownModeUsesTheFallbackModel() {
        val parsed = parseElicitation(
            requestId = "req-1",
            agentId = "opencode",
            sessionId = "sess-1",
            params = JsonObject(mapOf("mode" to JsonPrimitive("binary"))),
        )
        assertTrue(parsed is Elicitation.Unsupported)
        assertNull((parsed as Elicitation.Unsupported).message)
    }
}
