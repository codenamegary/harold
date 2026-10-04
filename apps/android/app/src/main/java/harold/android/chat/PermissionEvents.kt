package harold.android.chat

import harold.android.contracts.PermissionRequest
import harold.android.contracts.PermissionStatus

fun activePermissionRequest(
    pending: List<PermissionRequest>,
): PermissionRequest? =
    pending
        .filter { item -> item.status == PermissionStatus.Pending }
        .minByOrNull { item -> item.createdAt }
