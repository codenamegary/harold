package harold.android.chat

import harold.android.live.Elicitation
import harold.android.live.ElicitationDraft
import harold.android.live.ElicitationQuestion
import harold.android.live.isQuestionValid
import harold.android.live.isValid

/** Editable state for the active question card and its modal sheet. */
data class ElicitationUiState(
    val requestId: String? = null,
    val showSheet: Boolean = false,
    val stepIndex: Int = 0,
    val review: Boolean = false,
    /** Closing the sheet keeps the draft, so reopening never loses answers. */
    val draft: ElicitationDraft = ElicitationDraft(),
    val submitting: Boolean = false,
    val submittingAction: String? = null,
    val error: String? = null,
    val rawExpanded: Boolean = false,
    val urlOpenError: String? = null,
)

/** Oldest pending question wins the single card above the composer. */
fun activeElicitation(pending: List<Elicitation>): Elicitation? = pending.firstOrNull()

fun Elicitation.questionCount(): Int =
    if (this is Elicitation.Form) questions.size else 1

fun Elicitation.questionAt(stepIndex: Int): ElicitationQuestion? =
    (this as? Elicitation.Form)?.questions?.getOrNull(stepIndex)

fun ElicitationQuestion.isChoice(): Boolean = when (kind) {
    is harold.android.live.ElicitationKind.SingleSelect,
    is harold.android.live.ElicitationKind.MultiSelect,
    -> true
    else -> false
}

fun ElicitationUiState.currentQuestion(request: Elicitation): ElicitationQuestion? =
    request.questionAt(stepIndex)

fun ElicitationUiState.canAdvance(request: Elicitation): Boolean =
    (request as? Elicitation.Form)?.questions?.let(draft::isValid) ?: true

fun ElicitationUiState.stepValid(request: Elicitation): Boolean {
    val question = currentQuestion(request) ?: return true
    return draft.isQuestionValid(question)
}

fun ElicitationUiState.atLastStep(request: Elicitation): Boolean =
    stepIndex >= request.questionCount() - 1

/** Next shows on every form step; Submit replaces it on the last one. */
fun ElicitationUiState.footerAction(request: Elicitation): ElicitationFooter =
    when {
        request !is Elicitation.Form -> ElicitationFooter.Open
        review -> ElicitationFooter.Submit
        atLastStep(request) && request.questions.size > 1 -> ElicitationFooter.Review
        atLastStep(request) -> ElicitationFooter.Submit
        else -> ElicitationFooter.Next
    }

enum class ElicitationFooter {
    Next,
    Review,
    Submit,
    Open,
}

fun Elicitation.cardTitle(): String = when (this) {
    is Elicitation.Form -> questions.firstOrNull()?.title ?: "Question"
    is Elicitation.Url -> "Open link"
    is Elicitation.Unsupported -> "This request cannot be displayed"
}

fun Elicitation.extraQuestionCount(): Int = (questionCount() - 1).coerceAtLeast(0)
