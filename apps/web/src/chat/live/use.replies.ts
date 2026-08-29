import { useAtomValue, useSetAtom } from "jotai"
import { extensionAtom, permissionAtom } from "./atoms"
import { resolvePermissionAtom } from "./actions"
import { StreamExtension } from "./ExtensionPanel"
import { StreamPermission } from "./parse.permission"
import { ChatStream } from "./use.stream"

type UseLiveRepliesResult = {
  permission: StreamPermission | null
  extension: StreamExtension | null
  replyToPermission: (optionId: string) => void
  replyToExtension: (result: unknown) => void
}

export const useLiveReplies = (stream: ChatStream): UseLiveRepliesResult => {
  const permission = useAtomValue(permissionAtom)
  const extension = useAtomValue(extensionAtom)
  const resolvePermission = useSetAtom(resolvePermissionAtom)
  const setExtension = useSetAtom(extensionAtom)

  const replyToPermission = (optionId: string) => {
    if (permission === null) {
      return
    }

    stream.send({
      type: "permission_reply",
      requestId: permission.requestId,
      optionId,
    })
    resolvePermission()
  }

  const replyToExtension = (result: unknown) => {
    if (extension === null) {
      return
    }

    stream.send({
      type: "extension_reply",
      requestId: extension.requestId,
      result,
    })
    setExtension(null)
  }

  return {
    permission,
    extension,
    replyToPermission,
    replyToExtension,
  }
}
