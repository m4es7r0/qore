/**
 * Normalized error class for API operations.
 *
 * `ApiError` provides a consistent shape for all errors that can occur
 * during HTTP requests — server errors, timeouts, network failures, etc.
 *
 * Use the `toApiError()` helper to convert any caught exception into
 * an `ApiError` instance.
 *
 * @example
 * ```ts
 * import { toApiError, ApiError } from "qore";
 *
 * try {
 *   await api.get("items").json();
 * } catch (err) {
 *   const apiErr = await toApiError(err);
 *
 *   if (apiErr.status === 404) {
 *     // handle not found
 *   }
 *   if (apiErr.isNetwork) {
 *     // show offline banner
 *   }
 *   if (apiErr.isTimeout) {
 *     // suggest retry
 *   }
 * }
 * ```
 */
import { HTTPError, NetworkError, TimeoutError } from "ky";
import type { ApiErrorBody } from "./api-response";

/**
 * Normalized API error with status, code, typed body, and convenience flags.
 *
 * @example
 * ```ts
 * const err = new ApiError({
 *   message: "User not found",
 *   status: 404,
 *   code: "USER_NOT_FOUND",
 *   body: { message: "User not found", code: "USER_NOT_FOUND" },
 * });
 *
 * err.isClientError // true  (4xx)
 * err.isServerError // false (5xx)
 * ```
 */
export class ApiError extends Error {
  /** HTTP status code (0 for network/unknown errors). */
  readonly status: number;

  /** Machine-readable error code (e.g. "HTTP_404", "TIMEOUT", "NETWORK_ERROR"). */
  readonly code: string;

  /** Parsed JSON body from the error response, if available. */
  readonly body: ApiErrorBody | null;

  /** `true` when the request timed out. */
  readonly isTimeout: boolean;

  /** `true` when the error is a network failure (offline, DNS, etc.). */
  readonly isNetwork: boolean;

  constructor(opts: {
    message: string;
    status: number;
    code: string;
    body: ApiErrorBody | null;
    isTimeout?: boolean;
    isNetwork?: boolean;
    cause?: unknown;
  }) {
    super(opts.message, { cause: opts.cause });
    this.name = "ApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.body = opts.body;
    this.isTimeout = opts.isTimeout ?? false;
    this.isNetwork = opts.isNetwork ?? false;
  }

  /** `true` for 4xx status codes. */
  get isClientError() {
    return this.status >= 400 && this.status < 500;
  }

  /** `true` for 5xx status codes. */
  get isServerError() {
    return this.status >= 500;
  }
}

/**
 * Converts any caught error into a normalized `ApiError`.
 *
 * Handles the following error types:
 *
 * | Input                  | `status` | `code`           |
 * |------------------------|----------|------------------|
 * | `ky.HTTPError`         | HTTP code| `HTTP_<code>` or body code |
 * | `ky.TimeoutError`      | 408      | `TIMEOUT`        |
 * | `ky.NetworkError`      | 0        | `NETWORK_ERROR`  |
 * | `TypeError` (raw fetch)| 0        | `NETWORK_ERROR`  |
 * | Any other `Error`      | 0        | `UNKNOWN`        |
 *
 * ## ky 2 note
 *
 * `HTTPError.data` carries the PRE-PARSED response body (populated by ky
 * before `beforeError` hooks run). The response body stream is consumed in
 * the process, so `error.response.json()` no longer works — `data` is the
 * only correct source.
 *
 * @example
 * ```ts
 * try {
 *   await api.post("orders", { json: order }).json();
 * } catch (err) {
 *   const apiErr = await toApiError(err);
 *   toast.error(apiErr.message);
 * }
 * ```
 */
export async function toApiError(error: unknown): Promise<ApiError> {
  if (error instanceof ApiError) return error;

  if (error instanceof HTTPError) {
    // ky 2: the body is pre-parsed into `data` (object for JSON, string
    // otherwise, undefined when empty/unparsable). The response stream is
    // already consumed — do NOT try `error.response.json()`.
    const body =
      typeof error.data === "object" && error.data !== null
        ? (error.data as ApiErrorBody)
        : null;

    return new ApiError({
      message: body?.message ?? `HTTP ${error.response.status}: ${error.response.statusText}`,
      status: error.response.status,
      code: body?.code ?? `HTTP_${error.response.status}`,
      body,
      cause: error,
    });
  }

  if (error instanceof TimeoutError) {
    return new ApiError({
      message: "Request timed out",
      status: 408,
      code: "TIMEOUT",
      body: null,
      isTimeout: true,
      cause: error,
    });
  }

  // ky 2 wraps connectivity failures into its own NetworkError…
  if (error instanceof NetworkError) {
    return new ApiError({
      message: "Network error — check your connection",
      status: 0,
      code: "NETWORK_ERROR",
      body: null,
      isNetwork: true,
      cause: error,
    });
  }

  // …but keep the raw-fetch heuristic for errors thrown outside ky.
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return new ApiError({
      message: "Network error — check your connection",
      status: 0,
      code: "NETWORK_ERROR",
      body: null,
      isNetwork: true,
      cause: error,
    });
  }

  const fallback = error instanceof Error ? error : new Error(String(error));
  return new ApiError({
    message: fallback.message,
    status: 0,
    code: "UNKNOWN",
    body: null,
    cause: fallback,
  });
}
