export type DeviceError =
  | { kind: "pairing_code_not_found" }
  | { kind: "pairing_code_claimed" }
  | { kind: "pairing_code_expired" }
  | { kind: "pairing_code_revoked" }
  | { kind: "pairing_code_race" }
  | { kind: "device_not_found" }
