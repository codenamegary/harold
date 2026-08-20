import { RuntimeSettings } from "contracts/http/runtime-settings"

export const isCloudProxyOn = (settings: RuntimeSettings): boolean =>
  settings.advertisedUrl !== null && settings.advertisedUrlEnabled
