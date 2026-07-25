import { QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Provider } from "jotai"
import "./index.css"
import App from "./App.tsx"
import { NowTicker } from "./connection/nowAtom"
import { queryClient } from "./query/queryClient"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Provider>
        <NowTicker />
        <App />
      </Provider>
    </QueryClientProvider>
  </StrictMode>,
)
