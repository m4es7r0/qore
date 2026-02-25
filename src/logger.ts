/**
 * Preconfigured `consola` loggers for API operations.
 *
 * Two loggers are exported:
 * - `logger` — general API logger (tagged `[api]`)
 * - `errorLogger` — error-specific logger (tagged `[api][error]`)
 *
 * ## Log levels
 *
 * The default level is **1** (errors only). Override via `setLogLevel()`:
 *
 * ```ts
 * import { setLogLevel } from "qore";
 *
 * // During development — enable verbose output
 * setLogLevel(4);
 *
 * // In production — errors only (default)
 * setLogLevel(1);
 * ```
 *
 * ### Automatic detection (Vite example)
 *
 * ```ts
 * import { setLogLevel } from "qore";
 *
 * if (import.meta.env.DEV) {
 *   setLogLevel(4);
 * }
 * ```
 *
 * ### Automatic detection (Node.js example)
 *
 * ```ts
 * import { setLogLevel } from "qore";
 *
 * if (process.env.NODE_ENV === "development") {
 *   setLogLevel(4);
 * }
 * ```
 *
 * @example
 * ```ts
 * import { logger, errorLogger } from "qore";
 *
 * logger.debug("Fetching users...");
 * errorLogger.error("Failed to fetch users", err);
 * ```
 */
import { createConsola } from "consola/browser";

/** General-purpose API logger. */
export const logger = createConsola({ level: 1 }).withTag("api");

/** Error-scoped API logger (inherits level from `logger`). */
export const errorLogger = logger.withTag("error");

/**
 * Sets the log level for all API loggers.
 *
 * | Level | Output          |
 * |-------|-----------------|
 * | 0     | Silent          |
 * | 1     | Errors only     |
 * | 2     | + Warnings      |
 * | 3     | + Info/Success  |
 * | 4     | + Debug (verbose)|
 *
 * @example
 * ```ts
 * import { setLogLevel } from "qore";
 * setLogLevel(import.meta.env.DEV ? 4 : 1);
 * ```
 */
export function setLogLevel(level: number): void {
  logger.level = level;
}
