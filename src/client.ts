/**
 * Configurable API client factory built on top of `ky` (>= 2).
 *
 * Provides:
 * - Composable middleware (logging, error normalization, auth, etc.)
 * - Sensible defaults (30s timeout, retry on 5xx, etc.)
 * - Two built-in middleware: logging and error normalization
 * - `createApiClient()` factory for creating project-specific instances
 *
 * ## Quick start
 *
 * ```ts
 * import { createApiClient } from "qore";
 *
 * export const api = createApiClient({
 *   prefix: "https://api.example.com/v1",
 * });
 *
 * // GET /v1/users
 * const users = await api.get("users").json<User[]>();
 * ```
 *
 * ## With custom middleware
 *
 * ```ts
 * import { createApiClient, type ApiMiddleware } from "qore";
 *
 * const authMiddleware: ApiMiddleware = {
 *   beforeRequest: ({ request }) => {
 *     request.headers.set("Authorization", `Bearer ${getToken()}`);
 *   },
 * };
 *
 * export const api = createApiClient({
 *   prefix: "/api",
 *   middleware: [authMiddleware],
 * });
 * ```
 *
 * ## Override defaults
 *
 * ```ts
 * export const api = createApiClient({
 *   prefix: "/api",
 *   options: {
 *     timeout: 60_000,
 *     retry: { limit: 5 },
 *   },
 * });
 * ```
 */
import ky, { isHTTPError, type Options, type KyInstance } from "ky";
import { type ApiMiddleware, composeMiddleware } from "./middleware";
import { logger, errorLogger } from "./logger";
import { toApiError } from "./api-error";

/**
 * Configuration for `createApiClient()`.
 */
export type ApiClientOptions = {
  /**
   * Prefix prepended to all request inputs (e.g. "https://api.example.com/v1").
   * (ky 2 renamed `prefixUrl` → `prefix`; qore follows ky's naming.)
   */
  prefix: string;

  /** Additional middleware appended after the built-in ones. */
  middleware?: ApiMiddleware[];

  /** Raw `ky` options — merged last, so they can override anything. */
  options?: Options;
};

/** `https://host/a/b?q=1` → `/a/b?q=1` — the host repeats on every line and
 *  only adds noise; fall back to the raw string for non-URL inputs. */
function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/**
 * Started-at timestamps for in-flight requests, FIFO per `METHOD url`.
 *
 * ky clones the `Request` between hooks (retry bookkeeping), so the object
 * identity can't key the lookup — the method+url string can. Concurrent
 * identical requests pair first-in/first-out: durations may swap between two
 * simultaneous identical calls, which is acceptable for dev logging.
 */
const inFlight = new Map<string, number[]>();

function markStart(request: Request): void {
  const key = `${request.method} ${request.url}`;
  const queue = inFlight.get(key) ?? [];
  queue.push(Date.now());
  inFlight.set(key, queue);
}

function takeDuration(request: Request): string {
  const key = `${request.method} ${request.url}`;
  const started = inFlight.get(key)?.shift();
  if (inFlight.get(key)?.length === 0) inFlight.delete(key);
  return started == null ? "" : ` (${Date.now() - started}ms)`;
}

/**
 * Built-in middleware: logs every outgoing request and incoming response
 * (path only — no host noise) with the request duration.
 *
 * @example
 * ```
 * [api] → GET /v1/users
 * [api] ← 200 /v1/users (142ms)
 * ```
 */
export const loggingMiddleware: ApiMiddleware = {
  beforeRequest: ({ request }) => {
    markStart(request);
    logger.debug(`→ ${request.method} ${pathOf(request.url)}`);
  },
  // `request.url`, not `response.url`: the request one is always present
  // (mocked fetches leave `response.url` empty) and matches the `→` line.
  afterResponse: ({ request, response }) => {
    logger.debug(`← ${response.status} ${pathOf(request.url)}${takeDuration(request)}`);
  },
  beforeError: ({ request, error }) => {
    if (isHTTPError(error)) {
      // The response line above already carried the duration.
      errorLogger.error(`${request.method} ${pathOf(request.url)} → ${error.response.status}`);
    } else {
      // No response ever arrived — settle the in-flight entry here.
      errorLogger.error(
        `${request.method} ${pathOf(request.url)} → network error${takeDuration(request)}`,
        error,
      );
    }
    return error;
  },
};

/**
 * Built-in middleware: normalizes `ky` errors into `ApiError` instances.
 *
 * After this middleware, all errors thrown by the client will be `ApiError`
 * with a consistent shape (status, code, body, flags).
 */
export const errorNormalizerMiddleware: ApiMiddleware = {
  beforeError: async ({ error }) => toApiError(error),
};

const defaultMiddleware: ApiMiddleware[] = [
  loggingMiddleware,
  errorNormalizerMiddleware,
];

/**
 * Creates a `ky` instance with composable middleware.
 *
 * Built-in middleware (logging + error normalization) runs first,
 * then any custom middleware you pass via `options.middleware`.
 *
 * @param options - Client configuration
 * @returns Configured `ky` instance ready for use
 *
 * @example
 * ```ts
 * // Minimal setup
 * const api = createApiClient({ prefix: "/api" });
 *
 * // With auth middleware
 * const api = createApiClient({
 *   prefix: "/api",
 *   middleware: [authMiddleware],
 * });
 *
 * // Usage
 * const users = await api.get("users").json<User[]>();
 * const user  = await api.post("users", { json: newUser }).json<User>();
 * ```
 */
export function createApiClient({
  prefix,
  middleware = [],
  options,
}: ApiClientOptions): KyInstance {
  const hooks = composeMiddleware(...defaultMiddleware, ...middleware);

  return ky.create({
    prefix,
    timeout: 30_000,
    retry: {
      limit: 2,
      methods: ["get"],
      statusCodes: [408, 429, 500, 502, 503, 504],
    },
    hooks,
    ...options,
  });
}
