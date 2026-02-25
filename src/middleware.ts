/**
 * Composable middleware system for `ky` HTTP hooks.
 *
 * Middleware lets you add reusable request/response/error logic that composes
 * cleanly — each middleware can define any subset of hooks.
 *
 * ## Architecture
 *
 * ```
 * Request → [middleware1.beforeRequest] → [middleware2.beforeRequest] → ky
 *   ky → [middleware1.afterResponse] → [middleware2.afterResponse] → Response
 *   Error → [middleware1.beforeError] → [middleware2.beforeError] → throw
 * ```
 *
 * Middleware runs in registration order — first added = first executed.
 *
 * @example
 * ```ts
 * import type { ApiMiddleware } from "qore";
 *
 * // Auth middleware — injects Bearer token
 * const authMiddleware: ApiMiddleware = {
 *   beforeRequest: (request) => {
 *     const token = getAccessToken();
 *     if (token) {
 *       request.headers.set("Authorization", `Bearer ${token}`);
 *     }
 *   },
 * };
 *
 * // Retry-after middleware — respects server's Retry-After header
 * const retryAfterMiddleware: ApiMiddleware = {
 *   afterResponse: (_request, _options, response) => {
 *     if (response.status === 429) {
 *       const retryAfter = response.headers.get("Retry-After");
 *       console.warn(`Rate limited. Retry after ${retryAfter}s`);
 *     }
 *   },
 * };
 *
 * // Use with createApiClient:
 * const api = createApiClient({
 *   prefixUrl: "/api",
 *   middleware: [authMiddleware, retryAfterMiddleware],
 * });
 * ```
 */
import type { BeforeRequestHook, AfterResponseHook, BeforeErrorHook, Hooks } from "ky";

/**
 * A single middleware unit. Define any subset of hooks — unused hooks
 * are simply skipped.
 */
export type ApiMiddleware = {
  /** Runs before every request (add headers, log, transform URL, etc.). */
  beforeRequest?: BeforeRequestHook;

  /** Runs after every successful response (log, transform, cache, etc.). */
  afterResponse?: AfterResponseHook;

  /** Runs when ky encounters an error (normalize, log, rethrow, etc.). */
  beforeError?: BeforeErrorHook;
};

/**
 * Merges an array of middleware objects into a single `ky` hooks config.
 *
 * @example
 * ```ts
 * import { composeMiddleware } from "qore";
 *
 * const hooks = composeMiddleware(loggingMiddleware, authMiddleware);
 * const api = ky.create({ hooks });
 * ```
 */
export function composeMiddleware(...middlewares: ApiMiddleware[]): Required<Hooks> {
  const hooks: Required<Hooks> = {
    beforeRequest: [],
    afterResponse: [],
    beforeError: [],
    beforeRetry: [],
  };

  for (const mw of middlewares) {
    if (mw.beforeRequest) hooks.beforeRequest.push(mw.beforeRequest);
    if (mw.afterResponse) hooks.afterResponse.push(mw.afterResponse);
    if (mw.beforeError) hooks.beforeError.push(mw.beforeError);
  }

  return hooks;
}
