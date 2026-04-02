/**
 * qore
 *
 * Universal API layer for React applications with TanStack Query.
 *
 * Provides:
 * - HTTP client (ky) with composable middleware
 * - Normalized error handling (ApiError)
 * - Structured logging (consola)
 * - Type-safe query key factories (createQueryKeys)
 * - Declarative cache strategies for mutations (withCacheStrategy)
 * - Standard API response types
 *
 * @example
 * ```ts
 * import {
 *   createApiClient,
 *   createQueryKeys,
 *   createCacheStrategy,
 *   withCacheStrategy,
 *   setQueryClient,
 *   type ApiMiddleware,
 * } from "qore";
 * ```
 *
 * @packageDocumentation
 */

// --- HTTP Client ---
export { createApiClient, loggingMiddleware, errorNormalizerMiddleware } from "./client";
export type { ApiClientOptions } from "./client";

// --- Middleware ---
export { composeMiddleware } from "./middleware";
export type { ApiMiddleware } from "./middleware";

// --- Error Handling ---
export { ApiError, toApiError } from "./api-error";

// --- Logging ---
export { logger, errorLogger, setLogLevel } from "./logger";

// --- Response Types ---
export type { ApiResponse, ApiErrorBody, PaginatedResponse } from "./api-response";

// --- Query Key Factory ---
export { createQueryKeys } from "./create-query-keys";

// --- Cache Strategy ---
export {
  createCacheStrategy,
  withCacheStrategy,
  cacheUpdate,
  setQueryClient,
} from "./cache-strategy";
export type { CacheStrategy } from "./cache-strategy";
