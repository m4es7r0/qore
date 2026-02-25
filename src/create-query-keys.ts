/**
 * Type-safe query key factory for TanStack Query.
 *
 * Generates hierarchical `queryOptions` objects that keep query keys
 * consistent across your application. Supports both **static** queries
 * (no parameters) and **parameterized** queries (with arguments).
 *
 * ## Why?
 *
 * Without a factory, query keys are scattered strings/arrays that drift
 * out of sync. This helper enforces a `[entity, scope, ...params]`
 * convention and co-locates the `queryFn` with the key.
 *
 * ## Quick start
 *
 * ```ts
 * import { createQueryKeys } from "qore";
 *
 * // 1. Define actions (fetchers)
 * async function getProducts(): Promise<Product[]> {
 *   return api.get("products").json();
 * }
 * async function getProduct(id: string): Promise<Product> {
 *   return api.get(`products/${id}`).json();
 * }
 *
 * // 2. Create query keys
 * export const productQueries = createQueryKeys("products", (q) => ({
 *   list: q.scope("list").query(getProducts),
 *   detail: q.scope("detail").query(
 *     (id: string) => [id] as const,
 *     (id) => getProduct(id),
 *   ),
 * }));
 * ```
 *
 * ## Usage with TanStack Query
 *
 * ```tsx
 * import { useQuery } from "@tanstack/react-query";
 * import { productQueries } from "@/entities/product/api/queries";
 *
 * // Static query — pass the object directly
 * const { data: products } = useQuery(productQueries.list);
 * // queryKey: ["products", "list"]
 *
 * // Parameterized query — call the function first
 * const { data: product } = useQuery(productQueries.detail(id));
 * // queryKey: ["products", "detail", id]
 * ```
 *
 * ## Cache invalidation
 *
 * ```ts
 * import { useQueryClient } from "@tanstack/react-query";
 *
 * const qc = useQueryClient();
 *
 * // Invalidate all product queries (list + all details)
 * qc.invalidateQueries({ queryKey: productQueries._def });
 * // queryKey prefix: ["products"]
 *
 * // Invalidate only the list
 * qc.invalidateQueries({ queryKey: productQueries.list.queryKey });
 * // queryKey: ["products", "list"]
 *
 * // Invalidate a specific detail
 * qc.invalidateQueries({ queryKey: productQueries.detail("abc").queryKey });
 * // queryKey: ["products", "detail", "abc"]
 * ```
 */
import { queryOptions } from "@tanstack/react-query";

/**
 * Creates a type-safe query key factory for the given entity.
 *
 * @typeParam TEntity - Entity name string literal (e.g. "products", "users")
 * @typeParam TResult - Shape of the returned query options object
 *
 * @param entity - Root entity name used as the first segment of every query key
 * @param factory - Builder callback that defines scopes and their queries
 * @returns An object with all defined queries + a `_def` key for broad invalidation
 *
 * @example
 * ```ts
 * export const userQueries = createQueryKeys("users", (q) => ({
 *   list: q.scope("list").query(getUsers),
 *   detail: q.scope("detail").query(
 *     (id: string) => [id] as const,
 *     (id) => getUser(id),
 *   ),
 *   byRole: q.scope("byRole").query(
 *     (role: string, active: boolean) => [role, active] as const,
 *     (role, active) => getUsersByRole(role, active),
 *   ),
 * }));
 *
 * // Generated keys:
 * // userQueries._def           → ["users"]
 * // userQueries.list.queryKey  → ["users", "list"]
 * // userQueries.detail("1")    → { queryKey: ["users", "detail", "1"], queryFn: ... }
 * // userQueries.byRole("admin", true) → { queryKey: ["users", "byRole", "admin", true], queryFn: ... }
 * ```
 */
export function createQueryKeys<
  TEntity extends string,
  TResult extends Record<string, unknown>,
>(
  entity: TEntity,
  factory: (q: QueryKeyBuilder<TEntity>) => TResult,
): TResult & { _def: readonly [TEntity] } {
  const root = [entity] as const;

  const q: QueryKeyBuilder<TEntity> = {
    scope: (<TScope extends string>(scope: TScope) => {
      const scopeKey = [...root, scope] as const;
      return {
        query: (paramsOrFn: unknown, queryFn?: unknown) => {
          if (!queryFn) {
            return queryOptions({
              queryKey: scopeKey,
              queryFn: paramsOrFn as () => unknown,
            });
          }
          return (...args: unknown[]) => {
            const segments = (paramsOrFn as (...a: unknown[]) => readonly unknown[])(...args);
            return queryOptions({
              queryKey: [...scopeKey, ...segments] as const,
              queryFn: () => (queryFn as (...a: unknown[]) => unknown)(...args),
            });
          };
        },
      };
    }) as QueryKeyBuilder<TEntity>["scope"],
  };

  return { ...factory(q), _def: root };
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type QueryKeyBuilder<TEntity extends string> = {
  /**
   * Creates a scope under the entity.
   *
   * @typeParam TScope - Scope name literal (e.g. "list", "detail")
   */
  scope<TScope extends string>(scope: TScope): ScopedQuery<readonly [TEntity, TScope]>;
};

type ScopedQuery<TScopeKey extends readonly unknown[]> = {
  /**
   * **Static query** — no parameters, returns `queryOptions` directly.
   *
   * @example
   * ```ts
   * // Definition:
   * list: q.scope("list").query(getProducts),
   *
   * // Usage:
   * useQuery(productQueries.list)
   * // queryKey: ["products", "list"]
   * ```
   */
  query<TData>(
    queryFn: () => Promise<TData>,
  ): ReturnType<typeof queryOptions<TData, Error, TData, TScopeKey>>;

  /**
   * **Parameterized query** — returns a function that produces `queryOptions`.
   *
   * @param params - Function that turns arguments into additional key segments
   * @param queryFn - The actual data fetcher
   *
   * @example
   * ```ts
   * // Definition:
   * detail: q.scope("detail").query(
   *   (id: string) => [id] as const,
   *   (id) => getProduct(id),
   * ),
   *
   * // Usage:
   * useQuery(productQueries.detail("abc"))
   * // queryKey: ["products", "detail", "abc"]
   * ```
   */
  query<TData, TArgs extends unknown[]>(
    params: (...args: TArgs) => readonly unknown[],
    queryFn: (...args: TArgs) => Promise<TData>,
  ): (...args: TArgs) => ReturnType<typeof queryOptions<TData, Error, TData, readonly unknown[]>>;
};
