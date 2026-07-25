import React from "react"

export const DevicesDangerNote: React.FC = () => (
  <div className="mt-4 flex gap-[11px] rounded-[7px] border border-[rgba(255,117,109,0.1)] bg-[rgba(255,117,109,0.04)] p-3">
    <span
      aria-hidden
      className="grid size-[18px] shrink-0 place-items-center rounded-full bg-[rgba(255,117,109,0.1)] font-mono text-[10px] text-[#ff756d]"
    >
      !
    </span>
    <div>
      <strong className="mb-1 block text-[9px] text-[#c5abb0]">Lost a device?</strong>
      <p className="m-0 text-[9px] leading-[1.55] text-[#74808f]">
        Revoking access immediately invalidates its credentials. The device can be paired again
        later.
      </p>
    </div>
  </div>
)
