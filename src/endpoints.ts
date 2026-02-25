/**
 * Centralized endpoint path definitions.
 *
 * Keeps all API paths in one place so they're easy to find, refactor,
 * and share between actions, query keys, and tests.
 *
 * ## Why?
 *
 * - **Single source of truth** — no string URLs scattered across the codebase
 * - **Refactor-friendly** — rename a path in one place, IDE finds all usages
 * - **Type-safe** — parameterized endpoints are functions with typed arguments
 *
 * ## How to define
 *
 * ```ts
 * // shared/api/endpoints.ts (in your project)
 * export const endpoints = {
 *   products: {
 *     list: "products",
 *     detail: (id: string) => `products/${id}`,
 *     reviews: (id: string) => `products/${id}/reviews`,
 *   },
 *   orders: {
 *     list: "orders",
 *     detail: (id: string) => `orders/${id}`,
 *     cancel: (id: string) => `orders/${id}/cancel`,
 *   },
 *   auth: {
 *     login: "auth/login",
 *     refresh: "auth/refresh",
 *     me: "auth/me",
 *   },
 * } as const;
 * ```
 *
 * ## How to use
 *
 * ```ts
 * import { api } from "@/shared/api";
 * import { endpoints } from "@/shared/api/endpoints";
 *
 * // In actions:
 * async function getProducts(): Promise<Product[]> {
 *   return api.get(endpoints.products.list).json();
 * }
 *
 * async function getProduct(id: string): Promise<Product> {
 *   return api.get(endpoints.products.detail(id)).json();
 * }
 *
 * async function cancelOrder(id: string): Promise<void> {
 *   await api.post(endpoints.orders.cancel(id)).json();
 * }
 * ```
 *
 * ## Pattern
 *
 * This file is a **template/example** — copy it into your project and
 * customize with your actual API paths. The `qore` package
 * re-exports the pattern but does not include project-specific endpoints.
 */

// This is intentionally an example — project-specific endpoints
// should be defined in your project's shared/api/endpoints.ts.
// The package only provides the pattern and documentation.
