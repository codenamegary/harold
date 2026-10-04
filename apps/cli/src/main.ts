import { makeHaroldProgram } from "./harold.program"

makeHaroldProgram()
  .parseAsync(process.argv)
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
