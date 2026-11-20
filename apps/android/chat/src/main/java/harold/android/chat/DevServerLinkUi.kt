package harold.android.chat

import harold.android.network.LoopbackAddress

/**
 * State for opening a loopback link from an agent message or an elicitation.
 *
 * [pending] is the address the user tapped and has not confirmed yet, so the
 * prompt survives a recomposition. [opening] is set while the SSH forward is
 * being created, so the prompt can show progress. [browserUrl] is a one-shot
 * value: the screen launches the browser and clears it.
 * [acceptElicitationOnLaunch] carries the ACP accept of a link the agent asked
 * the user to open, because it may only be sent once the forwarded URL is in
 * the browser. [error] is the other terminal outcome.
 */
data class DevServerLinkUi(
    val pending: LoopbackAddress? = null,
    val opening: LoopbackAddress? = null,
    val browserUrl: String? = null,
    val error: String? = null,
    val acceptElicitationOnLaunch: Boolean = false,
) {
    val isOpening: Boolean
        get() = opening != null

    /** The address the prompt offers, whether or not the forward has started. */
    val promptAddress: LoopbackAddress?
        get() = opening ?: pending
}
