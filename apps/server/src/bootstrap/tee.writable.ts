import { Writable } from "node:stream"

/**
 * Forwards every written chunk to all destinations and calls back only once
 * every destination has accepted (or drained) the chunk. Used to tee the
 * daemon's pino stream to the log file and the foreground terminal so
 * `harold logs` keeps a file to tail while `harold serve` still prints.
 */
export const teeWritable = (destinations: readonly Writable[]): Writable =>
  new Writable({
    write(chunk, _encoding, callback) {
      if (destinations.length === 0) {
        callback()
        return
      }

      let remaining = destinations.length
      const markDestinationDone = () => {
        remaining -= 1
        if (remaining === 0) {
          callback()
        }
      }

      for (const destination of destinations) {
        if (destination.write(chunk)) {
          markDestinationDone()
        } else {
          destination.once("drain", markDestinationDone)
        }
      }
    },
  })
