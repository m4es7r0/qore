/**
 * Preconfigured `consola` loggers for API operations.
 *
 * Two loggers are exported:
 * - `logger` — general API logger (tagged `[api]`)
 * - `errorLogger` — error-specific logger (tagged `[api][error]`)
 *
 * ## Platform-aware reporter
 *
 * In a real browser the fancy `consola/browser` reporter is used (devtools
 * renders its `%c` CSS styling). Everywhere else — React Native, node, tests —
 * that styling would print as raw `%c` + CSS text, so a plain console reporter
 * is used instead: `[tag] message`.
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
 * ### Automatic detection (React Native example)
 *
 * ```ts
 * import { setLogLevel } from "qore";
 *
 * if (__DEV__) {
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
import { createConsola as createBrowserConsola } from "consola/browser";
import { createConsola as createCoreConsola, type ConsolaReporter } from "consola/core";

/** Devtools-only styling makes sense where devtools exist. */
const isBrowser = typeof document !== "undefined";

/**
 * Extra label appended to the tag by the plain reporter — e.g. `[api·ios]`.
 * Useful when several clients log into one console (React Native Metro with
 * iOS + Android connected). Set it once at app startup via `setLogContext`.
 */
let context = "";

/**
 * Appends a context label to every plain-reporter tag: `setLogContext('ios')`
 * → `[api·ios]` / `[api:error·ios]`. Pass an empty string to clear. No-op for
 * the browser reporter (a browser console hosts a single client).
 */
export function setLogContext(label: string): void {
  context = label ? `·${label}` : "";
}

/** Plain reporter for non-browser consoles (React Native Metro, node, tests). */
const plainReporter: ConsolaReporter = {
  log(logObj) {
    const fn =
      logObj.type === "error" || logObj.type === "fatal"
        ? console.error
        : logObj.type === "warn"
          ? console.warn
          : console.log;
    fn(logObj.tag ? `[${logObj.tag}${context}]` : "", ...logObj.args);
  },
};

/** General-purpose API logger. */
export const logger = (
  isBrowser
    ? createBrowserConsola({ level: 1 })
    : createCoreConsola({ level: 1, reporters: [plainReporter] })
).withTag("api");

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
