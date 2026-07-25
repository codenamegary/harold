import React from "react"
import { Link } from "react-router"
import { useConnection } from "../connection/useConnection"
import { SectionKicker } from "../design-system/SectionKicker"
import { heroCopyByPhase } from "./overviewCopy"

const secondaryLinkClassName =
  "inline-flex min-h-9 items-center justify-center gap-3 rounded-[7px] border border-line-strong bg-panel-2 px-3.5 text-base font-semibold whitespace-nowrap text-body hover:border-line-hover-strong hover:bg-hover-surface-strong hover:text-white"

const primaryLinkClassName =
  "inline-flex min-h-9 items-center justify-center gap-3 rounded-[7px] border border-lime bg-lime px-3.5 text-base font-semibold whitespace-nowrap text-lime-ink shadow-[0_0_0_1px_rgba(0,0,0,0.18),inset_0_1px_rgba(255,255,255,0.25)] hover:bg-lime-hover"

export const OverviewHero: React.FC = () => {
  const { connection } = useConnection()
  const heroCopy = heroCopyByPhase[connection.phase]

  return (
    <div className="mb-[25px] flex items-end justify-between gap-[30px] max-[820px]:flex-col max-[820px]:items-start max-[820px]:gap-[17px]">
      <div>
        <SectionKicker>
          <span
            aria-hidden
            className="size-1.5 rounded-full bg-lime shadow-[0_0_0_4px_rgba(182,243,107,0.08)]"
          />
          SYSTEM HEALTH
        </SectionKicker>
        <h2 className="m-0 text-[clamp(24px,3vw,32px)] leading-[1.15] font-semibold tracking-[-0.04em]">
          {heroCopy.title}
        </h2>
        <p className="m-0 mt-[9px] text-xs text-muted">{heroCopy.description}</p>
      </div>
      <div className="flex gap-2">
        <Link className={secondaryLinkClassName} to="/connect">
          Configure access
        </Link>
        <Link className={primaryLinkClassName} to="/chat">
          Run a prompt <span aria-hidden>⌘↵</span>
        </Link>
      </div>
    </div>
  )
}
