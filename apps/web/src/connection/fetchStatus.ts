import { StatusSchema } from "contracts/http/status"

export const fetchStatus = async () => {
  const response = await fetch("/v1/status")

  if (!response.ok) {
    throw new Error(`Status fetch failed with ${response.status}`)
  }

  const payload: unknown = await response.json()
  return StatusSchema.parse(payload)
}
