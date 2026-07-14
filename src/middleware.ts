/**
 * Composable middleware system for `ky` HTTP hooks (ky >= 2).
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
 * ## ky 2 hook contracts (differ from ky 1!)
 *
 * Every hook receives a single **state object** instead of positional args:
 * - `beforeRequest({ request, options, retryCount })`
 * - `afterResponse({ request, options, response, retryCount })`
 * - `beforeError({ request, options, error, retryCount })` → MUST return an `Error`
 * - `beforeRetry({ request, options, error, retryCount })`
 * - `init(options)` — runs before options are normalized
 *
 * @example
 * ```ts
 * import type { ApiMiddleware } from "qore";
 *
 * // Auth middleware — injects Bearer token
 * const authMiddleware: ApiMiddleware = {
 *   beforeRequest: ({ request }) => {
 *     const token = getAccessToken();
 *     if (token) {
 *       request.headers.set("Authorization", `Bearer ${token}`);
 *     }
 *   },
 * };
 *
 * // Retry-after middleware — respects server's Retry-After header
 * const retryAfterMiddleware: ApiMiddleware = {
 *   afterResponse: ({ response }) => {
 *     if (response.status === 429) {
 *       const retryAfter = response.headers.get("Retry-After");
 *       console.warn(`Rate limited. Retry after ${retryAfter}s`);
 *     }
 *   },
 * };
 *
 * // Use with createApiClient:
 * const api = createApiClient({
 *   prefix: "/api",
 *   middleware: [authMiddleware, retryAfterMiddleware],
 * });
 * ```
 */
import type {
  InitHook,
  BeforeRequestHook,
  AfterResponseHook,
  BeforeErrorHook,
  BeforeRetryHook,
  Hooks,
} from "ky";

/**
 * A single middleware unit. Define any subset of hooks — unused hooks
 * are simply skipped.
 */
export type ApiMiddleware = {
  /** Runs once per call before options are normalized (mutate `options`). */
  init?: InitHook;

  /** Runs before every request (add headers, log, transform URL, etc.). */
  beforeRequest?: BeforeRequestHook;

  /** Runs after every successful response (log, transform, cache, etc.). */
  afterResponse?: AfterResponseHook;

  /** Runs when ky encounters an error — must RETURN the (possibly replaced) error. */
  beforeError?: BeforeErrorHook;

  /** Runs before each retry attempt (inspect `state.error`, abort with `ky.stop`). */
  beforeRetry?: BeforeRetryHook;
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
    init: [],
    beforeRequest: [],
    afterResponse: [],
    beforeError: [],
    beforeRetry: [],
  };

  for (const mw of middlewares) {
    if (mw.init) hooks.init.push(mw.init);
    if (mw.beforeRequest) hooks.beforeRequest.push(mw.beforeRequest);
    if (mw.afterResponse) hooks.afterResponse.push(mw.afterResponse);
    if (mw.beforeError) hooks.beforeError.push(mw.beforeError);
    if (mw.beforeRetry) hooks.beforeRetry.push(mw.beforeRetry);
  }

  return hooks;
}
