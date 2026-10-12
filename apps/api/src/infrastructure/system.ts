import { pino } from "pino";
import type { Clock, IdGenerator, Logger } from "../application/ports.ts";
import { toTaskId } from "../domain/task/task.ts";

/**
 * Adapters for ambient system concerns.
 *
 * Wrapping the clock, id generation, and logging as ports looks like ceremony
 * until the first test that needs a fixed timestamp. Then it is the reason no
 * test in this repository has to freeze timers globally.
 */

export function systemClock(): Clock {
  return { now: () => new Date() };
}

export function uuidGenerator(): IdGenerator {
  return { nextTaskId: () => toTaskId(crypto.randomUUID()) };
}

export function createLogger(level: string, pretty: boolean): Logger {
  const instance = pino({
    level,
    // Structured JSON in production so log aggregators can parse it; a readable
    // stream locally. Never pretty-print in production — it breaks ingestion.
    ...(pretty ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
    redact: {
      paths: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token"],
      censor: "[redacted]",
    },
  });

  return {
    debug: (message, context) => instance.debug(context ?? {}, message),
    info: (message, context) => instance.info(context ?? {}, message),
    warn: (message, context) => instance.warn(context ?? {}, message),
    error: (message, context) => instance.error(context ?? {}, message),
  };
}
