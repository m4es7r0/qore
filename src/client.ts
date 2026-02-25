/**
 * Configurable API client factory built on top of `ky`.
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
 *   prefixUrl: "https://api.example.com/v1",
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
 *   beforeRequest: (request) => {
 *     request.headers.set("Authorization", `Bearer ${getToken()}`);
 *   },
 * };
 *
 * export const api = createApiClient({
 *   prefixUrl: "/api",
 *   middleware: [authMiddleware],
 * });
 * ```
 *
 * ## Override defaults
 *
 * ```ts
 * export const api = createApiClient({
 *   prefixUrl: "/api",
 *   options: {
 *     timeout: 60_000,
 *     retry: { limit: 5 },
 *   },
 * });
 * ```
 */
import ky, { type Options, type KyInstance } from "ky";
import { type ApiMiddleware, composeMiddleware } from "./middleware";
import { logger, errorLogger } from "./logger";
import { toApiError } from "./api-error";

/**
 * Configuration for `createApiClient()`.
 */
export type ApiClientOptions = {
  /** Base URL prepended to all requests (e.g. "https://api.example.com/v1"). */
  prefixUrl: string;

  /** Additional middleware appended after the built-in ones. */
  middleware?: ApiMiddleware[];

  /** Raw `ky` options — merged last, so they can override anything. */
  options?: Options;
};

/**
 * Built-in middleware: logs every outgoing request and incoming response.
 *
 * @example
 * ```
 * [api] → GET https://api.example.com/v1/users
 * [api] ← 200 https://api.example.com/v1/users
 * ```
 */
export const loggingMiddleware: ApiMiddleware = {
  beforeRequest: (request) => {
    logger.debug(`→ ${request.method} ${request.url}`);
  },
  afterResponse: (_request, _options, response) => {
    logger.debug(`← ${response.status} ${response.url}`);
  },
  beforeError: (error) => {
    const { response } = error;
    errorLogger.error(
      `${error.request.method} ${error.request.url} → ${response?.status ?? "network error"}`,
      response ? undefined : error,
    );
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
  beforeError: async (error) => {
    const apiError = await toApiError(error);
    throw apiError;
  },
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
 * const api = createApiClient({ prefixUrl: "/api" });
 *
 * // With auth middleware
 * const api = createApiClient({
 *   prefixUrl: "/api",
 *   middleware: [authMiddleware],
 * });
 *
 * // Usage
 * const users = await api.get("users").json<User[]>();
 * const user  = await api.post("users", { json: newUser }).json<User>();
 * ```
 */
export function createApiClient({
  prefixUrl,
  middleware = [],
  options,
}: ApiClientOptions): KyInstance {
  const hooks = composeMiddleware(...defaultMiddleware, ...middleware);

  return ky.create({
    prefixUrl,
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
