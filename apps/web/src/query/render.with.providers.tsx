import { QueryClientProvider } from "@tanstack/react-query"
import { render, RenderOptions } from "@testing-library/react"
import { createStore, Provider } from "jotai"
import React from "react"
import { MemoryRouter } from "react-router"
import { createTestQueryClient } from "./create.test.query.client"

type RenderWithProvidersOptions = {
  initialEntries?: string[]
  jotaiStore?: ReturnType<typeof createStore>
  queryClient?: ReturnType<typeof createTestQueryClient>
} & Omit<RenderOptions, "wrapper">

export const renderWithProviders = (
  ui: React.ReactElement,
  options: RenderWithProvidersOptions = {},
) => {
  const {
    initialEntries,
    jotaiStore = createStore(),
    queryClient = createTestQueryClient(),
    ...renderOptions
  } = options

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const content = initialEntries ? (
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    ) : (
      children
    )

    return (
      <QueryClientProvider client={queryClient}>
        <Provider store={jotaiStore}>{content}</Provider>
      </QueryClientProvider>
    )
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
    jotaiStore,
  }
}
