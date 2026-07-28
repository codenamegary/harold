import { readFile, writeFile } from "node:fs/promises"
import { createAcpJsonRpcError, AcpJsonRpcError } from "./acp-json-rpc-error"
import { SessionBindingRegistry } from "./session-binding-registry"
import { resolvePathWithinWorkspace } from "./resolve-path-within-workspace"

export type AcpFsHandlersDeps = {
  sessionBindingRegistry: SessionBindingRegistry
}

type FsReadParams = {
  sessionId?: string
  path?: string
  line?: number
  limit?: number
}

type FsWriteParams = {
  sessionId?: string
  path?: string
  content?: string
}

const ACP_INVALID_REQUEST = -32600
const ACP_APPLICATION_ERROR = -32000

const createAcpError = (message: string, code = ACP_APPLICATION_ERROR): AcpJsonRpcError =>
  createAcpJsonRpcError(message, code)

const requireSessionWorkspace = (
  sessionBindingRegistry: SessionBindingRegistry,
  sessionId: string | undefined,
): { ok: true; workspaceRoot: string } | { ok: false; error: AcpJsonRpcError } => {
  if (!sessionId) {
    return { ok: false, error: createAcpError("session not bound", ACP_INVALID_REQUEST) }
  }

  const workspaceRoot = sessionBindingRegistry.getWorkspaceRoot(sessionId)
  if (!workspaceRoot) {
    return { ok: false, error: createAcpError("session not bound") }
  }

  return { ok: true, workspaceRoot }
}

const sliceFileContent = (content: string, line?: number, limit?: number): string => {
  if (line === undefined && limit === undefined) {
    return content
  }

  const lines = content.split("\n")
  const startIndex = line === undefined ? 0 : Math.max(line - 1, 0)
  const endIndex = limit === undefined ? lines.length : startIndex + limit
  return lines.slice(startIndex, endIndex).join("\n")
}

export const createAcpFsHandlers = ({ sessionBindingRegistry }: AcpFsHandlersDeps) => ({
  "fs/read_text_file": async (params: unknown) => {
    const request = params as FsReadParams
    const session = requireSessionWorkspace(sessionBindingRegistry, request.sessionId)
    if (!session.ok) {
      throw session.error
    }

    if (!request.path) {
      throw createAcpError("path is required", ACP_INVALID_REQUEST)
    }

    const resolved = resolvePathWithinWorkspace({
      workspaceRoot: session.workspaceRoot,
      filePath: request.path,
    })
    if (!resolved.ok) {
      throw createAcpError(resolved.message)
    }

    const content = await readFile(resolved.absolutePath, "utf8")
    return { content: sliceFileContent(content, request.line, request.limit) }
  },

  "fs/write_text_file": async (params: unknown) => {
    const request = params as FsWriteParams
    const session = requireSessionWorkspace(sessionBindingRegistry, request.sessionId)
    if (!session.ok) {
      throw session.error
    }

    if (!request.path) {
      throw createAcpError("path is required", ACP_INVALID_REQUEST)
    }

    if (typeof request.content !== "string") {
      throw createAcpError("content is required", ACP_INVALID_REQUEST)
    }

    const resolved = resolvePathWithinWorkspace({
      workspaceRoot: session.workspaceRoot,
      filePath: request.path,
    })
    if (!resolved.ok) {
      throw createAcpError(resolved.message)
    }

    await writeFile(resolved.absolutePath, request.content, "utf8")
    return {}
  },
})
