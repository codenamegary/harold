import { useAtomValue, useStore } from "jotai"
import { SessionStreamClientMessage } from "contracts/http/session.stream"
import { applyPermissionResolved } from "./acp.transcript.reducer"
import {
  extensionAtom,
  permissionAtom,
  submittingExtensionAtom,
  submittingOptionIdAtom,
  transcriptAtom,
} from "./atoms"
import { StreamExtension } from "./ExtensionPanel"
import { StreamPermission } from "./parse.permission"

type UseLiveRepliesParams = {
  send: (message: SessionStreamClientMessage) => void
}

type UseLiveRepliesResult = {
  permission: StreamPermission | null
  extension: StreamExtension | null
  submittingOptionId: string | null
  submittingExtension: boolean
  handlePermissionOption: (optionId: string) => void
  handleExtensionReply: (result: unknown) => void
}

export const useLiveReplies = (params: UseLiveRepliesParams): UseLiveRepliesResult => {
  const { send } = params
  const store = useStore()
  const permission = useAtomValue(permissionAtom)
  const extension = useAtomValue(extensionAtom)
  const submittingOptionId = useAtomValue(submittingOptionIdAtom)
  const submittingExtension = useAtomValue(submittingExtensionAtom)

  const handlePermissionOption = (optionId: string) => {
    const current = store.get(permissionAtom)
    if (current === null) {
      return
    }

    store.set(submittingOptionIdAtom, optionId)
    send({
      type: "permission_reply",
      requestId: current.requestId,
      optionId,
    })
    store.set(permissionAtom, null)
    store.set(submittingOptionIdAtom, null)
    store.set(
      transcriptAtom,
      applyPermissionResolved(store.get(transcriptAtom)),
    )
  }

  const handleExtensionReply = (result: unknown) => {
    const current = store.get(extensionAtom)
    if (current === null) {
      return
    }

    store.set(submittingExtensionAtom, true)
    send({
      type: "extension_reply",
      requestId: current.requestId,
      result,
    })
    store.set(extensionAtom, null)
    store.set(submittingExtensionAtom, false)
  }

  return {
    permission,
    extension,
    submittingOptionId,
    submittingExtension,
    handlePermissionOption,
    handleExtensionReply,
  }
}
