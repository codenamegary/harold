export {}

declare module "bun:test" {
  interface Matchers<T = unknown>
    extends import("@testing-library/jest-dom/types/matchers").TestingLibraryMatchers<
      ReturnType<typeof import("bun:test").expect.stringContaining>,
      T
    > {}
}
