import React from "react"
import { OverviewAccessBanner } from "../../overview/OverviewAccessBanner"
import { OverviewHero } from "../../overview/OverviewHero"
import { OverviewMetrics } from "../../overview/OverviewMetrics"
import { OverviewPanels } from "../../overview/OverviewPanels"

export const OverviewPage: React.FC = () => (
  <main>
    <OverviewHero />
    <OverviewMetrics />
    <OverviewPanels />
    <OverviewAccessBanner />
  </main>
)
