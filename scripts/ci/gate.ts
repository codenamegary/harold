// Verdict for the ci-ok job, the single status check that branch protection
// requires. A result passes only when every job reported success or was
// skipped by the path filter; failure, cancellation, and unknown results all
// fail the gate rather than voiding protection.

export const gatePasses = (results: readonly string[]): boolean =>
  results.length > 0 && results.every((result) => result === "success" || result === "skipped")

if (import.meta.main) {
  const results = process.argv.slice(2)
  const passes = gatePasses(results)
  console.log(passes ? "gate: pass" : `gate: fail (${results.join(", ")})`)
  process.exit(passes ? 0 : 1)
}
