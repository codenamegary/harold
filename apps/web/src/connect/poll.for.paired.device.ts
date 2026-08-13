import { Device } from "contracts/http/device"
import { fetchDevices } from "../devices/fetch.devices"
import { findNewlyPairedDevice } from "./find.newly.paired.device"

export const PAIR_DEVICE_POLL_INTERVAL_MS = 1000

export const pollForPairedDevice = (params: {
  intervalMs?: number
  fetchDevicesFn?: typeof fetchDevices
  onPaired: (device: Device) => void
}): (() => void) => {
  const intervalMs = params.intervalMs ?? PAIR_DEVICE_POLL_INTERVAL_MS
  const fetchDevicesFn = params.fetchDevicesFn ?? fetchDevices
  const disposed = { value: false }
  const baselineIds = { current: null as Set<string> | null }
  const timer = { current: null as ReturnType<typeof setInterval> | null }

  const tick = async () => {
    if (disposed.value) {
      return
    }

    const collection = await fetchDevicesFn().catch(() => null)
    if (disposed.value || collection === null) {
      return
    }

    if (baselineIds.current === null) {
      baselineIds.current = new Set(collection.items.map((device) => device.id))
      return
    }

    const paired = findNewlyPairedDevice({
      baselineIds: baselineIds.current,
      devices: collection.items,
    })

    if (paired === undefined) {
      return
    }

    params.onPaired(paired)
    disposed.value = true
    if (timer.current !== null) {
      clearInterval(timer.current)
      timer.current = null
    }
  }

  void tick()
  timer.current = setInterval(() => {
    void tick()
  }, intervalMs)

  return () => {
    disposed.value = true
    if (timer.current !== null) {
      clearInterval(timer.current)
      timer.current = null
    }
  }
}
