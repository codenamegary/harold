import React from "react"
import { Link } from "react-router"

const secondaryLinkClassName =
  "inline-flex min-h-9 items-center justify-center gap-3 rounded-[7px] border border-line-strong bg-panel-2 px-3.5 text-base font-semibold whitespace-nowrap text-body hover:border-line-hover-strong hover:bg-hover-surface-strong hover:text-white max-[640px]:col-span-full"

export const OverviewAccessBanner: React.FC = () => (
  <article className="mt-2.5 grid min-h-[72px] grid-cols-[auto_minmax(175px,1fr)_auto_auto] items-center gap-[15px] rounded-[9px] border border-lime/13 bg-[linear-gradient(100deg,rgba(182,243,107,0.06),#0e1116_30%)] px-[15px] py-3 max-[1100px]:grid-cols-[auto_1fr_auto] max-[640px]:grid-cols-[auto_1fr]">
    <div
      aria-hidden
      className="grid size-[35px] place-items-center rounded-[7px] bg-lime/10 font-mono text-lg text-lime"
    >
      ↗
    </div>
    <div>
      <div className="text-sm font-semibold">Connect from anywhere</div>
      <p className="m-0 mt-1 text-xs text-dim">
        Expose your server securely with a tunnel or reverse proxy.
      </p>
    </div>
    <div className="flex items-center gap-2 font-mono text-2xs text-[#5f6875] max-[640px]:col-span-2">
      <span className="text-lime">✓ Local server</span>
      <span aria-hidden className="h-px w-[22px] bg-[#2d343f]" />
      <span>External access</span>
      <span aria-hidden className="h-px w-[22px] bg-[#2d343f]" />
      <span>Pair devices</span>
    </div>
    <Link className={secondaryLinkClassName} to="/connect">
      Continue setup
    </Link>
  </article>
)
