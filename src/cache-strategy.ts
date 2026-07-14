/**
 * Cache strategy pattern for TanStack Query mutations.
 *
 * Declaratively describe how a mutation interacts with the query cache —
 * invalidation, optimistic updates, and prefetching — then let
 * `withCacheStrategy()` wire everything into `MutationOptions`.
 *
 * ## Why?
 *
 * Without this, every mutation duplicates `onSuccess`/`onMutate`/`onError`
 * boilerplate for cache management. The strategy pattern:
 * - **Separates concerns** — cache logic lives next to entity queries, not in UI
 * - **Is declarative** — describe *what* to invalidate, not *how*
 * - **Is testable** — strategies are plain objects
 * - **Is reusable** — one strategy can be shared across mutation hooks
 *
 * ## Quick start
 *
 * ```ts
 * import {
 *   createCacheStrategy,
 *   withCacheStrategy,
 * } from "qore";
 *
 * // 1. Define the strategy (typically in entities/<name>/api/cache.ts)
 * export const updateProductCache = createCacheStrategy<Product, UpdateProductParams>({
 *   invalidate: (variables, _data) => [
 *     productQueries._def,                         // broad: all product queries
 *     categoryQueries.detail(variables.categoryId).queryKey,  // related
 *   ],
 * });
 *
 * // 2. Wire it up (typically in entities/<name>/api/mutations.ts)
 * export const updateProductMutation = withCacheStrategy(
 *   updateProduct,        // (variables) => Promise<Product>
 *   updateProductCache,
 * );
 *
 * // 3. Use in components
 * const mutation = useMutation(updateProductMutation());
 * mutation.mutate({ id: "abc", name: "New name", categoryId: "cat-1" });
 * ```
 *
 * ## Optimistic updates
 *
 * ```ts
 * export const toggleTodoCache = createCacheStrategy<Todo, { id: string }>({
 *   invalidate: () => [todoQueries._def],
 *   optimistic: [
 *     cacheUpdate(todoQueries.list, (variables, old) =>
 *       (old ?? []).map((t) =>
 *         t.id === variables.id ? { ...t, done: !t.done } : t,
 *       ),
 *     ),
 *   ],
 * });
 * ```
 *
 * ## Prefetching after mutation
 *
 * ```ts
 * export const createOrderCache = createCacheStrategy<Order, CreateOrderParams>({
 *   invalidate: (v) => [orderQueries._def],
 *   prefetch: (v, data) => [
 *     orderQueries.detail(data.id),  // { queryKey, queryFn }
 *   ],
 * });
 * ```
 */
import {
  type MutationOptions,
  type QueryClient,
  type QueryFunction,
  type SkipToken,
} from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// CacheStrategy type
// ---------------------------------------------------------------------------

type OptimisticTarget<TVariables> = {
  queryKey: (variables: TVariables) => readonly unknown[];
  updater: (variables: TVariables, old: unknown) => unknown;
};

type Snapshot = { queryKey: readonly unknown[]; previous: unknown };
type OptimisticContext = { snapshots: Snapshot[] };

/**
 * Declarative description of how a mutation interacts with the query cache.
 *
 * @typeParam TData - The data type returned by the mutation
 * @typeParam TVariables - The variables/parameters the mutation accepts
 */
export type CacheStrategy<TData, TVariables> = {
  /**
   * Query keys to invalidate after the mutation succeeds.
   * Receives `variables` and `data` so you can build dynamic keys.
   *
   * @example
   * ```ts
   * invalidate: (variables, data) => [
   *   entityQueries._def,
   *   relatedQueries.detail(variables.parentId).queryKey,
   * ]
   * ```
   */
  invalidate?: (
    variables: TVariables,
    data: TData,
  ) => readonly (readonly unknown[])[];

  /**
   * Optimistic update targets — mutate cached data *before* the server responds.
   * Supports multiple targets so a single mutation can optimistically update
   * several caches. Automatically rolls back all targets on error.
   *
   * Each target's `queryKey` is a function of `variables`, enabling
   * parameterized queries (e.g. `deployQueries.list(v.funnelId).queryKey`).
   *
   * @example
   * ```ts
   * optimistic: [
   *   cacheUpdate(todoQueries.list, (variables, old) =>
   *     (old ?? []).map(t =>
   *       t.id === variables.id ? { ...t, done: !t.done } : t
   *     ),
   *   ),
   * ]
   * ```
   */
  optimistic?: readonly OptimisticTarget<TVariables>[];

  /**
   * Queries to prefetch after the mutation succeeds.
   * Useful for warming caches of pages the user will navigate to next.
   *
   * Return objects with `queryKey` and an optional `queryFn` so that
   * `prefetchQuery` can actually fetch the data.
   *
   * @example
   * ```ts
   * prefetch: (_variables, data) => [
   *   orderQueries.detail(data.id),  // { queryKey, queryFn }
   * ]
   * ```
   */
  prefetch?: (
    variables: TVariables,
    data: TData,
  ) => readonly {
    queryKey: readonly unknown[];
    queryFn?: QueryFunction | SkipToken;
  }[];
};

// ---------------------------------------------------------------------------
// createCacheStrategy
// ---------------------------------------------------------------------------

/**
 * Identity helper that provides type inference for `CacheStrategy`.
 * Saves you from manually writing the generic parameters.
 *
 * @typeParam TData - Mutation return type
 * @typeParam TVariables - Mutation parameters type
 *
 * @example
 * ```ts
 * // Without createCacheStrategy — requires explicit generics:
 * const strategy: CacheStrategy<Product, UpdateParams> = { ... };
 *
 * // With createCacheStrategy — infers from usage:
 * const strategy = createCacheStrategy<Product, UpdateParams>({
 *   invalidate: (v) => [productQueries._def],
 * });
 * ```
 */
export function createCacheStrategy<TData, TVariables>(
  strategy: CacheStrategy<TData, TVariables>,
): CacheStrategy<TData, TVariables> {
  return strategy;
}

// ---------------------------------------------------------------------------
// cacheUpdate
// ---------------------------------------------------------------------------

type InferQueryData<T> = T extends { queryFn?: infer F }
  ? Awaited<ReturnType<Extract<F, (...args: never[]) => unknown>>>
  : unknown;

/**
 * Type-safe factory for optimistic update targets.
 *
 * Infers the cached data type from the query's `queryFn` return type,
 * so `old` in the updater is properly typed without manual `as` casts.
 *
 * Accepts both static queries and parameterized query factories:
 *
 * @param query - A query options object, or a function `(variables) => queryOptions`
 * @param updater - Receives `(variables, old)` and returns the new cache value
 *
 * @example
 * ```ts
 * // Static query — old is inferred as Todo[] | undefined
 * cacheUpdate(todoQueries.list, (v, old) =>
 *   (old ?? []).map(t => t.id === v.id ? { ...t, done: !t.done } : t),
 * )
 *
 * // Parameterized query — old is inferred as Deploy[] | undefined
 * cacheUpdate(
 *   (v: RedeployParams) => deployQueries.list(v.funnelId),
 *   (v, old) => (old ?? []).map(d => d.id === v.deployId ? { ...d, status: "deploying" } : d),
 * )
 * ```
 */
export function cacheUpdate<
  TVariables,
  TQuery extends { queryKey: readonly unknown[] },
>(
  query: TQuery | ((variables: TVariables) => TQuery),
  updater: (
    variables: TVariables,
    old: InferQueryData<TQuery> | undefined,
  ) => InferQueryData<TQuery>,
): OptimisticTarget<TVariables> {
  return {
    queryKey:
      typeof query === "function"
        ? (v: TVariables) => (query as (v: TVariables) => TQuery)(v).queryKey
        : () => query.queryKey,
    updater: updater as OptimisticTarget<TVariables>["updater"],
  };
}

// ---------------------------------------------------------------------------
// withCacheStrategy
// ---------------------------------------------------------------------------

/**
 * Wraps a mutation function + cache strategy into a `MutationOptions` factory.
 *
 * The returned function is meant to be called inside `useMutation()`:
 *
 * ```ts
 * const mutation = useMutation(updateProductMutation());
 * ```
 *
 * **Important:** `withCacheStrategy` needs access to the `QueryClient`.
 * Pass it via `setQueryClient()` before using any mutations.
 *
 * @param mutationFn - The async function that performs the mutation
 * @param strategy - Cache strategy describing invalidation/optimistic/prefetch behavior
 * @returns A factory function that produces `MutationOptions`
 *
 * @example
 * ```ts
 * // entities/product/api/mutations.ts
 * import { withCacheStrategy } from "qore";
 * import { updateProduct } from "./actions";
 * import { updateProductCache } from "./cache";
 *
 * export const updateProductMutation = withCacheStrategy(
 *   updateProduct,
 *   updateProductCache,
 * );
 *
 * // In a React component:
 * import { useMutation } from "@tanstack/react-query";
 * import { updateProductMutation } from "@/entities/product/api/mutations";
 *
 * function ProductEditor({ product }: { product: Product }) {
 *   const { mutate, isPending } = useMutation(updateProductMutation());
 *
 *   return (
 *     <button
 *       disabled={isPending}
 *       onClick={() => mutate({ id: product.id, name: "Updated" })}
 *     >
 *       Save
 *     </button>
 *   );
 * }
 * ```
 */

let _queryClient: QueryClient | null = null;

/**
 * Registers the `QueryClient` instance used by `withCacheStrategy` mutations.
 *
 * Call this once during app initialization (e.g. in your providers file).
 *
 * @example
 * ```ts
 * // app/providers.tsx
 * import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
 * import { setQueryClient } from "qore";
 *
 * const queryClient = new QueryClient();
 * setQueryClient(queryClient);
 *
 * export function Providers({ children }: { children: React.ReactNode }) {
 *   return (
 *     <QueryClientProvider client={queryClient}>
 *       {children}
 *     </QueryClientProvider>
 *   );
 * }
 * ```
 */
export function setQueryClient(client: QueryClient): void {
  _queryClient = client;
}

function getQueryClient(): QueryClient {
  if (!_queryClient) {
    throw new Error(
      "[qore] QueryClient not set. " +
      "Call setQueryClient(queryClient) during app initialization.",
    );
  }
  return _queryClient;
}

export function withCacheStrategy<TData, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  strategy: CacheStrategy<TData, TVariables>,
): () => MutationOptions<TData, Error, TVariables> {
  return () => ({
    mutationFn,

    onMutate: strategy.optimistic
      ? async (variables: TVariables) => {
          const qc = getQueryClient();
          const snapshots: Snapshot[] = [];
          for (const target of strategy.optimistic!) {
            const key = target.queryKey(variables);
            await qc.cancelQueries({ queryKey: key });
            snapshots.push({
              queryKey: key,
              previous: qc.getQueryData(key),
            });
            qc.setQueryData(key, target.updater(variables, qc.getQueryData(key)));
          }
          return { snapshots } satisfies OptimisticContext;
        }
      : undefined,

    onError: strategy.optimistic
      ? (_error: Error, _variables: TVariables, context: unknown) => {
          const ctx = context as OptimisticContext | undefined;
          if (ctx?.snapshots) {
            const qc = getQueryClient();
            for (const { queryKey, previous } of ctx.snapshots) {
              qc.setQueryData(queryKey, previous);
            }
          }
        }
      : undefined,

    onSuccess: (data: TData, variables: TVariables) => {
      const qc = getQueryClient();
      if (strategy.invalidate) {
        for (const key of strategy.invalidate(variables, data)) {
          qc.invalidateQueries({ queryKey: key });
        }
      }
      if (strategy.prefetch) {
        for (const target of strategy.prefetch(variables, data)) {
          if (typeof target.queryFn === "function") {
            qc.prefetchQuery({
              queryKey: target.queryKey,
              queryFn: target.queryFn,
            });
          }
        }
      }
    },
  });
}
