import { DaemonState, ReadDaemonStateResult } from "./daemon.state.models"

export type ReadDaemonState = () => ReadDaemonStateResult

export type WriteDaemonState = (state: DaemonState) => void

export type IsProcessAlive = (pid: number) => boolean
