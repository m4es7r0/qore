# qore

Universal API layer for React applications built on **ky**, **consola**, and **TanStack Query**.

## Features

- **HTTP Client** — configurable `ky` instance with sensible defaults (timeouts, retry, etc.)
- **Composable Middleware** — add auth, logging, metrics, or any custom logic as composable hooks
- **Normalized Errors** — every error becomes an `ApiError` with status, code, body, and flags
- **Structured Logging** — `consola`-based logger with environment-aware levels
- **Query Key Factory** — type-safe, hierarchical `queryOptions` for TanStack Query
- **Cache Strategies** — declarative invalidation, optimistic updates, and prefetching for mutations
- **Standard Types** — shared `ApiResponse`, `ApiErrorBody`, `PaginatedResponse` shapes

## Installation

```bash
npm install qore

# Peer dependencies
npm install ky consola @tanstack/react-query
```

## Quick Start

### 1. Create an API client

```ts
// shared/api/client.ts
import { createApiClient, setLogLevel } from "qore";

// Enable verbose logging in development
if (import.meta.env.DEV) {
  setLogLevel(4);
}

export const api = createApiClient({
  prefixUrl: "https://api.example.com/v1",
});
```

### 2. Define endpoints

```ts
// shared/api/endpoints.ts
export const endpoints = {
  products: {
    list: "products",
    detail: (id: string) => `products/${id}`,
  },
  orders: {
    list: "orders",
    detail: (id: string) => `orders/${id}`,
    cancel: (id: string) => `orders/${id}/cancel`,
  },
} as const;
```

### 3. Create entity actions (fetchers)

```ts
// entities/product/api/actions.ts
import { api } from "@/shared/api/client";
import { endpoints } from "@/shared/api/endpoints";
import type { Product } from "../model/types";

export async function getProducts(): Promise<Product[]> {
  return api.get(endpoints.products.list).json();
}

export async function getProduct(id: string): Promise<Product> {
  return api.get(endpoints.products.detail(id)).json();
}

export type UpdateProductParams = {
  id: string;
  name: string;
  categoryId: string;
};

export async function updateProduct(params: UpdateProductParams): Promise<Product> {
  return api.put(endpoints.products.detail(params.id), {
    json: params,
  }).json();
}
```

### 4. Define query keys

```ts
// entities/product/api/queries.ts
import { createQueryKeys } from "qore";
import { getProducts, getProduct } from "./actions";

export const productQueries = createQueryKeys("products", (q) => ({
  list: q.scope("list").query(getProducts),
  detail: q.scope("detail").query(
    (id: string) => [id] as const,
    (id) => getProduct(id),
  ),
}));
```

### 5. Define cache strategy + mutation

```ts
// entities/product/api/cache.ts
import { createCacheStrategy } from "qore";
import type { Product } from "../model/types";
import type { UpdateProductParams } from "./actions";
import { productQueries } from "./queries";

export const updateProductCache = createCacheStrategy<Product, UpdateProductParams>({
  invalidate: (variables) => [
    productQueries._def,                          // invalidate all product queries
    productQueries.detail(variables.id).queryKey,  // also specifically this detail
  ],
});
```

```ts
// entities/product/api/mutations.ts
import { withCacheStrategy } from "qore";
import { updateProduct } from "./actions";
import { updateProductCache } from "./cache";

export const updateProductMutation = withCacheStrategy(updateProduct, updateProductCache);
```

### 6. Register QueryClient

```ts
// app/providers.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setQueryClient } from "qore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

// Register once — enables withCacheStrategy to access the cache
setQueryClient(queryClient);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

### 7. Use in components

```tsx
// pages/products/ui/ProductListPage.tsx
import { useQuery, useMutation } from "@tanstack/react-query";
import { productQueries } from "@/entities/product/api/queries";
import { updateProductMutation } from "@/entities/product/api/mutations";

export function ProductListPage() {
  // Static query — pass the options object directly
  const { data: products, isLoading } = useQuery(productQueries.list);

  if (isLoading) return <div>Loading...</div>;

  return (
    <ul>
      {products?.map((p) => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  );
}

export function ProductDetail({ id }: { id: string }) {
  // Parameterized query — call the function
  const { data: product } = useQuery(productQueries.detail(id));

  // Mutation with automatic cache invalidation
  const { mutate, isPending } = useMutation(updateProductMutation());

  return (
    <div>
      <h1>{product?.name}</h1>
      <button
        disabled={isPending}
        onClick={() => mutate({ id, name: "Updated", categoryId: "cat-1" })}
      >
        Update
      </button>
    </div>
  );
}
```

---

## API Reference

### `createApiClient(options)`

Creates a configured `ky` HTTP client instance.

```ts
type ApiClientOptions = {
  prefixUrl: string;          // Base URL for all requests
  middleware?: ApiMiddleware[];  // Custom middleware (appended after built-in)
  options?: ky.Options;       // Raw ky options (override anything)
};
```

**Built-in defaults:**
- Timeout: 30 seconds
- Retry: 2 attempts on GET for 408, 429, 5xx
- Middleware: logging + error normalization

```ts
const api = createApiClient({
  prefixUrl: "/api",
  middleware: [authMiddleware],
  options: { timeout: 60_000 },
});
```

---

### Middleware

Middleware are objects with optional `beforeRequest`, `afterResponse`, and `beforeError` hooks.

```ts
import type { ApiMiddleware } from "qore";

const authMiddleware: ApiMiddleware = {
  beforeRequest: (request) => {
    const token = localStorage.getItem("token");
    if (token) {
      request.headers.set("Authorization", `Bearer ${token}`);
    }
  },
};

const metricsMiddleware: ApiMiddleware = {
  beforeRequest: (request) => {
    (request as any)._startTime = performance.now();
  },
  afterResponse: (request) => {
    const duration = performance.now() - (request as any)._startTime;
    analytics.track("api_request", { url: request.url, duration });
  },
};
```

Compose manually if needed:

```ts
import { composeMiddleware } from "qore";

const hooks = composeMiddleware(loggingMiddleware, authMiddleware, metricsMiddleware);
```

---

### `ApiError`

All errors thrown by the client are normalized to `ApiError`:

```ts
import { ApiError, toApiError } from "qore";

try {
  await api.get("items").json();
} catch (err) {
  const apiErr = await toApiError(err);

  apiErr.status;       // 404, 500, 408, 0, etc.
  apiErr.code;         // "HTTP_404", "TIMEOUT", "NETWORK_ERROR", "UNKNOWN"
  apiErr.message;      // Human-readable message
  apiErr.body;         // Parsed JSON error body (or null)
  apiErr.isClientError; // true for 4xx
  apiErr.isServerError; // true for 5xx
  apiErr.isTimeout;    // true for timeouts
  apiErr.isNetwork;    // true for offline/DNS errors
}
```

**Error mapping:**

| Input               | `status` | `code`             |
|---------------------|----------|--------------------|
| `ky.HTTPError`      | HTTP code| `HTTP_<code>` or body code |
| `ky.TimeoutError`   | 408      | `TIMEOUT`          |
| `TypeError` (fetch) | 0        | `NETWORK_ERROR`    |
| Other `Error`       | 0        | `UNKNOWN`          |

---

### `createQueryKeys(entity, factory)`

Creates type-safe query keys for an entity.

```ts
const productQueries = createQueryKeys("products", (q) => ({
  // Static — returns queryOptions directly
  list: q.scope("list").query(getProducts),

  // Parameterized — returns a function
  detail: q.scope("detail").query(
    (id: string) => [id] as const,
    (id) => getProduct(id),
  ),

  // Multiple params
  search: q.scope("search").query(
    (term: string, page: number) => [term, page] as const,
    (term, page) => searchProducts(term, page),
  ),
}));

// Generated keys:
productQueries._def                          // ["products"]
productQueries.list.queryKey                  // ["products", "list"]
productQueries.detail("abc").queryKey         // ["products", "detail", "abc"]
productQueries.search("shoes", 2).queryKey    // ["products", "search", "shoes", 2]
```

**Usage with TanStack Query:**

```tsx
// Static: pass directly
useQuery(productQueries.list);

// Parameterized: call first
useQuery(productQueries.detail(id));

// Cache invalidation
queryClient.invalidateQueries({ queryKey: productQueries._def });   // all
queryClient.invalidateQueries({ queryKey: productQueries.list.queryKey }); // list only
```

---

### `createCacheStrategy(strategy)`

Type-inference helper for defining cache strategies:

```ts
type CacheStrategy<TData, TVariables> = {
  // Keys to invalidate after success
  invalidate?: (variables: TVariables, data: TData) => readonly (readonly unknown[])[];

  // Optimistic update — applied before server responds, rolled back on error
  optimistic?: {
    queryKey: readonly unknown[];
    updater: (variables: TVariables, old: TData | undefined) => TData;
  };

  // Keys to prefetch after success
  prefetch?: (variables: TVariables, data: TData) => readonly (readonly unknown[])[];
};
```

---

### `withCacheStrategy(mutationFn, strategy)`

Wraps a mutation function + strategy into a `MutationOptions` factory:

```ts
const updateMutation = withCacheStrategy(updateProduct, updateProductCache);

// In component:
const { mutate } = useMutation(updateMutation());
```

---

### `setQueryClient(client)`

Registers the `QueryClient` for use by `withCacheStrategy`. Call once during app init:

```ts
const queryClient = new QueryClient();
setQueryClient(queryClient);
```

---

## Architecture: Recommended FSD Layout

```
src/
├── app/
│   └── providers.tsx           # QueryClientProvider + setQueryClient
├── shared/
│   └── api/
│       ├── client.ts           # createApiClient instance
│       ├── endpoints.ts        # all API paths
│       └── index.ts            # re-exports
├── entities/
│   └── product/
│       ├── model/
│       │   └── types.ts        # Product type
│       ├── api/
│       │   ├── actions.ts      # getProducts, getProduct, updateProduct
│       │   ├── queries.ts      # productQueries (createQueryKeys)
│       │   ├── cache.ts        # updateProductCache (createCacheStrategy)
│       │   └── mutations.ts    # updateProductMutation (withCacheStrategy)
│       ├── ui/
│       │   └── ProductCard.tsx
│       └── index.ts
├── features/
│   └── edit-product/
│       ├── model/
│       │   └── use-edit-product.ts  # useMutation(updateProductMutation())
│       └── ui/
│           └── EditProductForm.tsx
└── pages/
    └── products/
        └── ui/
            └── ProductListPage.tsx   # useQuery(productQueries.list)
```

### Layer responsibilities

| Layer        | Contains                                | Uses from `qore` |
|-------------|----------------------------------------|-------------------------------|
| `shared/api` | Client instance, endpoints             | `createApiClient`             |
| `entities/*/api` | Actions, queries, cache, mutations | `createQueryKeys`, `createCacheStrategy`, `withCacheStrategy` |
| `features`   | Mutation hooks, business logic         | –                             |
| `pages`      | `useQuery()`, page composition         | –                             |

---

## Full Example: CRUD Entity

Here's a complete example of setting up a `User` entity:

```ts
// --- entities/user/model/types.ts ---
export type User = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
};

// --- entities/user/api/actions.ts ---
import { api } from "@/shared/api";
import { endpoints } from "@/shared/api/endpoints";
import type { User } from "../model/types";

export async function getUsers(): Promise<User[]> {
  return api.get(endpoints.users.list).json();
}

export async function getUser(id: string): Promise<User> {
  return api.get(endpoints.users.detail(id)).json();
}

export type CreateUserParams = { name: string; email: string; role: User["role"] };

export async function createUser(params: CreateUserParams): Promise<User> {
  return api.post(endpoints.users.list, { json: params }).json();
}

export type UpdateUserParams = { id: string } & Partial<CreateUserParams>;

export async function updateUser(params: UpdateUserParams): Promise<User> {
  return api.put(endpoints.users.detail(params.id), { json: params }).json();
}

export async function deleteUser(id: string): Promise<void> {
  await api.delete(endpoints.users.detail(id));
}

// --- entities/user/api/queries.ts ---
import { createQueryKeys } from "qore";
import { getUsers, getUser } from "./actions";

export const userQueries = createQueryKeys("users", (q) => ({
  list: q.scope("list").query(getUsers),
  detail: q.scope("detail").query(
    (id: string) => [id] as const,
    (id) => getUser(id),
  ),
}));

// --- entities/user/api/cache.ts ---
import { createCacheStrategy } from "qore";
import type { User } from "../model/types";
import type { CreateUserParams, UpdateUserParams } from "./actions";
import { userQueries } from "./queries";

export const createUserCache = createCacheStrategy<User, CreateUserParams>({
  invalidate: () => [userQueries._def],
});

export const updateUserCache = createCacheStrategy<User, UpdateUserParams>({
  invalidate: (v) => [
    userQueries.list.queryKey,
    userQueries.detail(v.id).queryKey,
  ],
});

export const deleteUserCache = createCacheStrategy<void, string>({
  invalidate: (id) => [
    userQueries.list.queryKey,
    userQueries.detail(id).queryKey,
  ],
});

// --- entities/user/api/mutations.ts ---
import { withCacheStrategy } from "qore";
import { createUser, updateUser, deleteUser } from "./actions";
import { createUserCache, updateUserCache, deleteUserCache } from "./cache";

export const createUserMutation = withCacheStrategy(createUser, createUserCache);
export const updateUserMutation = withCacheStrategy(updateUser, updateUserCache);
export const deleteUserMutation = withCacheStrategy(deleteUser, deleteUserCache);
```

---

## Peer Dependencies

| Package | Version |
|---------|---------|
| `ky` | >= 1.0.0 |
| `consola` | >= 3.0.0 |
| `@tanstack/react-query` | >= 5.0.0 |

## License

Private package.
