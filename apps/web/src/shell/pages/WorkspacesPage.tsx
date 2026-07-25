import React from "react"
import { WorkspaceCardGrid } from "../../workspace/WorkspaceCardGrid"
import { WorkspacesPageIntro } from "../../workspace/WorkspacesPageIntro"
import { WorkspacesToolbar } from "../../workspace/WorkspacesToolbar"

export const WorkspacesPage: React.FC = () => (
  <main>
    <WorkspacesPageIntro />
    <WorkspacesToolbar />
    <WorkspaceCardGrid />
  </main>
)
