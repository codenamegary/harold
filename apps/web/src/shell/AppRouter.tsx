import React from "react"
import { BrowserRouter, Navigate, Route, Routes } from "react-router"
import { AppShell } from "./AppShell"
import { ChatPage } from "./pages/ChatPage"
import { ConnectPage } from "./pages/ConnectPage"
import { DevicesPage } from "./pages/DevicesPage"
import { LogsPage } from "./pages/LogsPage"
import { SessionsPage } from "./pages/SessionsPage"
import { SettingsPage } from "./pages/SettingsPage"
import { WorkspacesPage } from "./pages/WorkspacesPage"

export const AppRoutes: React.FC = () => (
  <Routes>
    <Route element={<AppShell />}>
      <Route index element={<Navigate replace to="/chat" />} />
      <Route path="connect" element={<ConnectPage />} />
      <Route path="workspaces" element={<WorkspacesPage />} />
      <Route path="devices" element={<DevicesPage />} />
      <Route path="chat" element={<ChatPage />} />
      <Route path="sessions" element={<SessionsPage />} />
      <Route path="logs" element={<LogsPage />} />
      <Route path="settings" element={<SettingsPage />} />
    </Route>
  </Routes>
)

export const AppRouter: React.FC = () => (
  <BrowserRouter>
    <AppRoutes />
  </BrowserRouter>
)
