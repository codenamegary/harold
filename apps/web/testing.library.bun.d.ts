import { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers"
import { expect } from "bun:test"

export {}

declare module "bun:test" {
  interface Matchers<T = unknown> extends TestingLibraryMatchers<
    ReturnType<typeof expect.stringContaining>,
    T
  > {}
}
