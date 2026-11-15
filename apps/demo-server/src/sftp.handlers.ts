import ssh2, { Attributes, SFTPWrapper } from "ssh2"
import { VfsEntry, VfsStat, VfsStore } from "./vfs.store"

const { STATUS_CODE, OPEN_MODE } = ssh2.utils.sftp

type OpenHandle =
  | { kind: "file"; path: string; flags: number; chunks: Array<Buffer> }
  | { kind: "dir"; path: string; entries: ReadonlyArray<VfsEntry>; readDone: boolean }

const toAttrs = (stat: VfsStat): Attributes => {
  const mtimeSec = Math.floor(stat.mtimeMs / 1000)
  return {
    mode: stat.mode,
    uid: 1000,
    gid: 1000,
    size: stat.size,
    atime: mtimeSec,
    mtime: mtimeSec,
  }
}

const formatLongname = (entry: VfsEntry): string => {
  const prefix = entry.stat.isDirectory ? "d" : "-"
  const perms = entry.stat.isDirectory ? "rwxr-xr-x" : entry.stat.isExecutable ? "rwxr-xr-x" : "rw-r--r--"
  const size = String(entry.stat.size).padStart(8, " ")
  return `${prefix}${perms} 1 demo demo ${size} Nov  9 22:30 ${entry.name}`
}

export const attachSftpHandlers = (sftp: SFTPWrapper, vfs: VfsStore): void => {
  const handles = new Map<string, OpenHandle>()
  const state = { nextHandleId: 1 }

  const allocHandle = (entry: OpenHandle): Buffer => {
    const id = state.nextHandleId
    state.nextHandleId += 1
    const key = String(id)
    handles.set(key, entry)
    return Buffer.from(key)
  }

  sftp.on("REALPATH", (reqid, rawPath) => {
    const resolved = vfs.resolvePath(rawPath)
    const stat = vfs.stat(resolved) ?? {
      isDirectory: true,
      isExecutable: true,
      size: 4096,
      mtimeMs: Date.now(),
      mode: 0o40755,
    }
    sftp.name(reqid, [
      {
        filename: resolved,
        longname: resolved,
        attrs: toAttrs(stat),
      },
    ])
  })

  const handleStat = (reqid: number, rawPath: string): void => {
    const resolved = vfs.resolvePath(rawPath)
    const stat = vfs.stat(resolved)
    if (!stat) {
      sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE)
      return
    }
    sftp.attrs(reqid, toAttrs(stat))
  }

  sftp.on("STAT", handleStat)
  sftp.on("LSTAT", handleStat)

  sftp.on("FSTAT", (reqid, handleBuf) => {
    const handle = handles.get(handleBuf.toString())
    if (!handle) {
      sftp.status(reqid, STATUS_CODE.FAILURE)
      return
    }
    const stat = vfs.stat(handle.path)
    if (!stat) {
      sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE)
      return
    }
    sftp.attrs(reqid, toAttrs(stat))
  })

  sftp.on("SETSTAT", (reqid) => {
    sftp.status(reqid, STATUS_CODE.OK)
  })
  sftp.on("FSETSTAT", (reqid) => {
    sftp.status(reqid, STATUS_CODE.OK)
  })

  sftp.on("OPENDIR", (reqid, rawPath) => {
    const resolved = vfs.resolvePath(rawPath)
    const stat = vfs.stat(resolved)
    if (!stat || !stat.isDirectory) {
      sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE)
      return
    }
    const entries = vfs.readdir(resolved)
    sftp.handle(
      reqid,
      allocHandle({ kind: "dir", path: resolved, entries, readDone: false }),
    )
  })

  sftp.on("READDIR", (reqid, handleBuf) => {
    const handle = handles.get(handleBuf.toString())
    if (!handle || handle.kind !== "dir") {
      sftp.status(reqid, STATUS_CODE.FAILURE)
      return
    }
    if (handle.readDone) {
      sftp.status(reqid, STATUS_CODE.EOF)
      return
    }
    handle.readDone = true
    sftp.name(
      reqid,
      handle.entries.map((entry) => ({
        filename: entry.name,
        longname: formatLongname(entry),
        attrs: toAttrs(entry.stat),
      })),
    )
  })

  sftp.on("OPEN", (reqid, filename, flags) => {
    const resolved = vfs.resolvePath(filename)
    const isWrite = (flags & OPEN_MODE.WRITE) !== 0
    const isCreate = (flags & OPEN_MODE.CREAT) !== 0
    const isTrunc = (flags & OPEN_MODE.TRUNC) !== 0
    const existing = vfs.readFile(resolved)

    if (!existing && !isCreate && !isWrite) {
      sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE)
      return
    }

    if (isWrite && (isCreate || isTrunc || !existing)) {
      if (!existing || isTrunc) {
        vfs.writeFile(resolved, Buffer.alloc(0))
      }
    }

    sftp.handle(
      reqid,
      allocHandle({
        kind: "file",
        path: resolved,
        flags,
        chunks: [],
      }),
    )
  })

  sftp.on("READ", (reqid, handleBuf, offset, length) => {
    const handle = handles.get(handleBuf.toString())
    if (!handle || handle.kind !== "file") {
      sftp.status(reqid, STATUS_CODE.FAILURE)
      return
    }
    const data = vfs.readFile(handle.path)
    if (!data) {
      sftp.status(reqid, STATUS_CODE.NO_SUCH_FILE)
      return
    }
    if (offset >= data.byteLength) {
      sftp.status(reqid, STATUS_CODE.EOF)
      return
    }
    const slice = data.subarray(offset, offset + length)
    sftp.data(reqid, slice)
  })

  sftp.on("WRITE", (reqid, handleBuf, offset, data) => {
    const handle = handles.get(handleBuf.toString())
    if (!handle || handle.kind !== "file") {
      sftp.status(reqid, STATUS_CODE.FAILURE)
      return
    }
    const existing = vfs.readFile(handle.path) ?? Buffer.alloc(0)
    const requiredLen = Math.max(existing.byteLength, offset + data.byteLength)
    const next = Buffer.alloc(requiredLen)
    existing.copy(next, 0)
    data.copy(next, offset)
    vfs.writeFile(handle.path, next)
    sftp.status(reqid, STATUS_CODE.OK)
  })

  sftp.on("CLOSE", (reqid, handleBuf) => {
    handles.delete(handleBuf.toString())
    sftp.status(reqid, STATUS_CODE.OK)
  })

  sftp.on("MKDIR", (reqid, rawPath) => {
    const ok = vfs.mkdir(rawPath, { recursive: true })
    sftp.status(reqid, ok ? STATUS_CODE.OK : STATUS_CODE.FAILURE)
  })

  sftp.on("RMDIR", (reqid, rawPath) => {
    const ok = vfs.remove(rawPath)
    sftp.status(reqid, ok ? STATUS_CODE.OK : STATUS_CODE.NO_SUCH_FILE)
  })

  sftp.on("REMOVE", (reqid, rawPath) => {
    const ok = vfs.remove(rawPath)
    sftp.status(reqid, ok ? STATUS_CODE.OK : STATUS_CODE.NO_SUCH_FILE)
  })

  sftp.on("RENAME", (reqid, oldPath, newPath) => {
    const ok = vfs.rename(oldPath, newPath)
    sftp.status(reqid, ok ? STATUS_CODE.OK : STATUS_CODE.NO_SUCH_FILE)
  })
}
