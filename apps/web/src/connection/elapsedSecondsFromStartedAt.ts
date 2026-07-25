export const elapsedSecondsFromStartedAt = (
  startedAt: string,
  now: number = Date.now(),
): number => {
  const elapsedMs = now - new Date(startedAt).getTime()
  return Math.max(0, Math.floor(elapsedMs / 1000))
}
