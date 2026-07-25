import React from "react"
import { BrowserRouter, Route, Routes } from "react-router"
import { ConnectionProvider } from "../connection/ConnectionProvider"
import { AppShell } from "./AppShell"
import { ChatPage } from "./pages/ChatPage"
import { ConnectPage } from "./pages/ConnectPage"
import { DevicesPage } from "./pages/DevicesPage"
import { OverviewPage } from "./pages/OverviewPage"
import { SettingsPage } from "./pages/SettingsPage"
import { WorkspacesPage } from "./pages/WorkspacesPage"

export const AppRoutes: React.FC = () => (
  <ConnectionProvider>
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<OverviewPage />} />
        <Route path="connect" element={<ConnectPage />} />
        <Route path="workspaces" element={<WorkspacesPage />} />
        <Route path="devices" element={<DevicesPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  </ConnectionProvider>
)

export const AppRouter: React.FC = () => (
  <BrowserRouter>
    <AppRoutes />
  </BrowserRouter>
)
