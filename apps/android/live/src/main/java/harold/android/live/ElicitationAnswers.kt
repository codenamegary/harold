package harold.android.live

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/**
 * Editable answers for a form elicitation. Single-select stores
 * [OTHER_OPTION_VALUE] while the "Other" choice is active; the companion text
 * lives in [otherText] and is only sent when it is non-empty.
 */
data class ElicitationDraft(
    val texts: Map<String, String> = emptyMap(),
    val single: Map<String, String> = emptyMap(),
    val multi: Map<String, Set<String>> = emptyMap(),
    val booleans: Map<String, Boolean> = emptyMap(),
    val otherSelected: Set<String> = emptySet(),
    val otherText: Map<String, String> = emptyMap(),
) {
    companion object {
        fun fromQuestions(questions: List<ElicitationQuestion>): ElicitationDraft {
            var draft = ElicitationDraft()
            for (question in questions) {
                val default = question.defaultValue ?: continue
                draft = when (val kind = question.kind) {
                    is ElicitationKind.Text -> {
                        val text = (default as? JsonPrimitive)?.content ?: continue
                        draft.copy(texts = draft.texts + (question.key to text))
                    }
                    is ElicitationKind.SingleSelect -> {
                        val value = (default as? JsonPrimitive)?.content ?: continue
                        draft.copy(single = draft.single + (question.key to value))
                    }
                    is ElicitationKind.MultiSelect -> {
                        val values = (default as? JsonArray)?.mapNotNull { element ->
                            (element as? JsonPrimitive)?.content
                        } ?: continue
                        draft.copy(multi = draft.multi + (question.key to values.toSet()))
                    }
                    is ElicitationKind.NumberField -> {
                        val number = (default as? JsonPrimitive)?.content ?: continue
                        draft.copy(texts = draft.texts + (question.key to number))
                    }
                    ElicitationKind.BooleanField -> {
                        val value = (default as? JsonPrimitive)?.content?.toBooleanStrictOrNull()
                            ?: continue
                        draft.copy(booleans = draft.booleans + (question.key to value))
                    }
                }
            }
            return draft
        }
    }

    fun textFor(key: String): String = texts[key] ?: ""

    fun singleFor(key: String): String? = single[key]

    fun multiFor(key: String): Set<String> = multi[key] ?: emptySet()

    fun booleanFor(key: String): Boolean = booleans[key] ?: false

    fun isOtherSelected(key: String): Boolean = key in otherSelected

    fun otherTextFor(key: String): String = otherText[key] ?: ""

    fun withText(key: String, value: String): ElicitationDraft =
        copy(texts = texts + (key to value))

    fun withSingle(key: String, value: String): ElicitationDraft =
        copy(single = single + (key to value))

    fun toggleMulti(key: String, value: String): ElicitationDraft {
        val current = multiFor(key)
        val next = if (value in current) current - value else current + value
        return copy(multi = multi + (key to next))
    }

    fun withBoolean(key: String, value: Boolean): ElicitationDraft =
        copy(booleans = booleans + (key to value))

    fun withOtherSelected(key: String, selected: Boolean): ElicitationDraft =
        copy(otherSelected = if (selected) otherSelected + key else otherSelected - key)

    fun withOtherText(key: String, value: String): ElicitationDraft =
        copy(otherText = otherText + (key to value))
}

fun ElicitationDraft.isQuestionValid(question: ElicitationQuestion): Boolean {
    val otherAnswered = otherTextFor(question.key).isNotBlank()
    return when (val kind = question.kind) {
        is ElicitationKind.Text -> {
            val text = textFor(question.key)
            if (text.isEmpty()) {
                !question.required
            } else {
                val length = text.length
                val minOk = kind.minLength == null || length >= kind.minLength
                val maxOk = kind.maxLength == null || length <= kind.maxLength
                val patternOk = kind.pattern == null || kind.pattern.containsMatchIn(text)
                minOk && maxOk && patternOk
            }
        }
        is ElicitationKind.SingleSelect -> {
            val choice = singleFor(question.key)
            when {
                choice == null -> !question.required
                choice == OTHER_OPTION_VALUE -> !question.required || otherAnswered
                else -> true
            }
        }
        is ElicitationKind.MultiSelect -> {
            val selected = multiFor(question.key).count { value ->
                kind.options.any { option -> option.value == value }
            }
            val count = selected + if (isOtherSelected(question.key) && otherAnswered) 1 else 0
            val minOk = kind.minItems == null || count >= kind.minItems
            val maxOk = kind.maxItems == null || count <= kind.maxItems
            val requiredOk = !question.required || count > 0
            minOk && maxOk && requiredOk
        }
        is ElicitationKind.NumberField -> {
            val text = textFor(question.key)
            if (text.isBlank()) {
                !question.required
            } else {
                val number = text.toDoubleOrNull()
                if (number == null) {
                    false
                } else {
                    val integerOk = !kind.integer || text.toLongOrNull() != null
                    val minOk = kind.minimum == null || number >= kind.minimum
                    val maxOk = kind.maximum == null || number <= kind.maximum
                    integerOk && minOk && maxOk
                }
            }
        }
        ElicitationKind.BooleanField -> true
    }
}

fun ElicitationDraft.isValid(questions: List<ElicitationQuestion>): Boolean =
    questions.all { question -> isQuestionValid(question) }

/** Builds the ACP `content` object. Unanswered fields are omitted. */
fun ElicitationDraft.toContent(questions: List<ElicitationQuestion>): JsonObject =
    buildJsonObject {
        for (question in questions) {
            when (val kind = question.kind) {
                is ElicitationKind.Text -> {
                    val text = textFor(question.key)
                    if (text.isNotEmpty()) {
                        put(question.key, text)
                    }
                }
                is ElicitationKind.SingleSelect -> {
                    when (val choice = singleFor(question.key)) {
                        null -> Unit
                        OTHER_OPTION_VALUE -> {
                            val otherKey = question.otherKey
                            val text = otherTextFor(question.key)
                            if (otherKey != null && text.isNotBlank()) {
                                put(otherKey, text)
                            }
                        }
                        else -> put(question.key, choice)
                    }
                }
                is ElicitationKind.MultiSelect -> {
                    val selected = multiFor(question.key)
                        .filter { value -> kind.options.any { option -> option.value == value } }
                    if (selected.isNotEmpty()) {
                        put(question.key, buildJsonArray {
                            selected.forEach { value -> add(JsonPrimitive(value)) }
                        })
                    }
                    val otherKey = question.otherKey
                    val other = otherTextFor(question.key)
                    if (otherKey != null && isOtherSelected(question.key) && other.isNotBlank()) {
                        put(otherKey, other)
                    }
                }
                is ElicitationKind.NumberField -> {
                    val text = textFor(question.key)
                    if (text.isNotBlank()) {
                        val number = if (kind.integer) {
                            text.toLongOrNull()?.let { JsonPrimitive(it) }
                        } else {
                            text.toDoubleOrNull()?.let { JsonPrimitive(it) }
                        }
                        if (number != null) {
                            put(question.key, number)
                        }
                    }
                }
                ElicitationKind.BooleanField -> {
                    put(question.key, JsonPrimitive(booleanFor(question.key)))
                }
            }
        }
    }

/** One-line answer labels for the transcript row. */
fun ElicitationDraft.answerSummary(
    questions: List<ElicitationQuestion>,
): List<Pair<String, String>> = questions.mapNotNull { question ->
    val value = when (val kind = question.kind) {
        is ElicitationKind.Text -> textFor(question.key).takeIf { it.isNotEmpty() }
        is ElicitationKind.SingleSelect -> when (val choice = singleFor(question.key)) {
            null -> null
            OTHER_OPTION_VALUE -> otherTextFor(question.key).takeIf { it.isNotBlank() }
            else -> kind.options.firstOrNull { it.value == choice }?.title ?: choice
        }
        is ElicitationKind.MultiSelect -> {
            val labels = multiFor(question.key).mapNotNull { value ->
                kind.options.firstOrNull { it.value == value }?.title
            }.toMutableList()
            if (isOtherSelected(question.key) && otherTextFor(question.key).isNotBlank()) {
                labels.add(otherTextFor(question.key))
            }
            labels.takeIf { it.isNotEmpty() }?.joinToString(", ")
        }
        is ElicitationKind.NumberField -> textFor(question.key).takeIf { it.isNotBlank() }
        ElicitationKind.BooleanField -> if (booleanFor(question.key)) "Yes" else "No"
    } ?: return@mapNotNull null
    question.title to value
}

/** Maps an accepted ACP `content` object to transcript labels. */
fun elicitationAnswerSummary(
    questions: List<ElicitationQuestion>,
    content: JsonElement?,
): List<Pair<String, String>> {
    val objectContent = content as? JsonObject ?: return emptyList()
    return questions.mapNotNull { question ->
        val other = question.otherKey
            ?.let { objectContent[it] as? JsonPrimitive }
            ?.content
            ?.takeIf { it.isNotBlank() }
        val label = when (question.kind) {
            is ElicitationKind.SingleSelect -> {
                if (other != null && objectContent[question.key] == null) {
                    other
                } else {
                    val text = (objectContent[question.key] as? JsonPrimitive)?.content
                    text?.let { value ->
                        question.kind.options.firstOrNull { it.value == value }?.title ?: value
                    }
                }
            }
            is ElicitationKind.MultiSelect -> {
                val items = (objectContent[question.key] as? JsonArray)?.mapNotNull { element ->
                    (element as? JsonPrimitive)?.content
                }.orEmpty()
                val labels = items.mapNotNull { item ->
                    question.kind.options.firstOrNull { it.value == item }?.title ?: item
                }.toMutableList()
                if (other != null) {
                    labels.add(other)
                }
                labels.takeIf { it.isNotEmpty() }?.joinToString(", ")
            }
            else -> other ?: (objectContent[question.key] as? JsonPrimitive)?.content
        } ?: return@mapNotNull null
        if (label.isBlank()) null else question.title to label
    }
}
