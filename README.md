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
npx degit m4es7r0/qore packages

# Peer dependencies
npm install ky consola @tanstack/react-query
```

## FSD Integration

qore is designed for the `shared/api/` segment in [Feature-Sliced Design](https://feature-sliced.design/) projects. Start with a minimal setup and extract layers only when the team agrees.

### Minimal FSD project (shared + pages + app)

```
src/
├── app/
│   └── providers.tsx            ← QueryClientProvider + setQueryClient
├── pages/
│   └── products/
│       ├── ui/
│       │   └── ProductListPage.tsx
│       ├── api/
│       │   ├── product-actions.ts    ← fetch functions (page-local)
│       │   ├── product-queries.ts    ← createQueryKeys (page-local)
│       │   └── product-cache.ts      ← cache strategy (page-local)
│       └── index.ts
└── shared/
    └── api/
        ├── client.ts            ← createApiClient instance
        ├── endpoints.ts         ← centralized endpoint paths
        └── index.ts
```

This is a valid, complete FSD setup. Most code lives in `pages/` — extract to lower layers only when needed.

### When to extract to entities

Extract to `entities/` only when **2+ pages share the same business model** and the team agrees:

```
src/
├── entities/
│   └── product/
│       ├── api/
│       │   ├── product-actions.ts
│       │   ├── product-queries.ts
│       │   ├── product-cache.ts
│       │   └── product-mutations.ts
│       ├── model/
│       │   └── product.ts           ← Product type + domain logic
│       └── index.ts
├── pages/
│   ├── products/                    ← uses entities/product
│   └── product-detail/              ← uses entities/product
└── shared/
    └── api/
```

## Quick Start

### 1. Create an API client

```ts
// shared/api/client.ts
import { createApiClient, setLogLevel } from "qore";

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

### 3. Register QueryClient

```ts
// app/providers.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setQueryClient } from "qore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
});

setQueryClient(queryClient);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
```

### 4. Define actions and queries (pages-first)

Keep everything in the page until extraction is needed:

```ts
// pages/products/api/product-actions.ts
import { api } from "@/shared/api";
import { endpoints } from "@/shared/api/endpoints";

export type Product = {
  id: string;
  name: string;
  categoryId: string;
};

export async function getProducts(): Promise<Product[]> {
  return api.get(endpoints.products.list).json();
}

export async function getProduct(id: string): Promise<Product> {
  return api.get(endpoints.products.detail(id)).json();
}
```

```ts
// pages/products/api/product-queries.ts
import { createQueryKeys } from "qore";
import { getProducts, getProduct } from "./product-actions";

export const productQueries = createQueryKeys("products", (q) => ({
  list: q.scope("list").query(getProducts),
  detail: q.scope("detail").query(
    (id: string) => [id] as const,
    (id) => getProduct(id),
  ),
}));
```

### 5. Use in components

```tsx
// pages/products/ui/ProductListPage.tsx
import { useQuery } from "@tanstack/react-query";
import { productQueries } from "../api/product-queries";

export function ProductListPage() {
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
  const { data: product } = useQuery(productQueries.detail(id));

  return <h1>{product?.name}</h1>;
}
```

### 6. Add cache strategy for mutations

```ts
// pages/products/api/product-cache.ts
import { createCacheStrategy, cacheUpdate } from "qore";
import type { Product } from "./product-actions";
import { productQueries } from "./product-queries";

export type UpdateProductParams = {
  id: string;
  name: string;
  categoryId: string;
};

export const updateProductCache = createCacheStrategy<Product, UpdateProductParams>({
  invalidate: (variables) => [
    productQueries._def,
    productQueries.detail(variables.id).queryKey,
  ],
  optimistic: [
    cacheUpdate(productQueries.list, (v, old) =>
      (old ?? []).map((p) => (p.id === v.id ? { ...p, name: v.name } : p)),
    ),
  ],
});
```

```ts
// pages/products/api/product-mutations.ts
import { withCacheStrategy } from "qore";
import { api } from "@/shared/api";
import { endpoints } from "@/shared/api/endpoints";
import type { Product, UpdateProductParams } from "./product-actions";
import { updateProductCache } from "./product-cache";

async function updateProduct(params: UpdateProductParams): Promise<Product> {
  return api.put(endpoints.products.detail(params.id), { json: params }).json();
}

export const updateProductMutation = withCacheStrategy(updateProduct, updateProductCache);
```

```tsx
// pages/products/ui/ProductEditor.tsx
import { useMutation } from "@tanstack/react-query";
import { updateProductMutation } from "../api/product-mutations";

export function ProductEditor({ id }: { id: string }) {
  const { mutate, isPending } = useMutation(updateProductMutation());

  return (
    <button
      disabled={isPending}
      onClick={() => mutate({ id, name: "Updated", categoryId: "cat-1" })}
    >
      Update
    </button>
  );
}
```

---

## Evolution: Extracting to Entities

When `ProductDetail` page also needs the same queries and types, extract to `entities/product/`:

```ts
// entities/product/model/product.ts
export type Product = {
  id: string;
  name: string;
  categoryId: string;
};

// entities/product/api/product-actions.ts
import { api } from "@/shared/api";
import { endpoints } from "@/shared/api/endpoints";
import type { Product } from "../model/product";

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
  return api.put(endpoints.products.detail(params.id), { json: params }).json();
}

// entities/product/api/product-queries.ts
import { createQueryKeys } from "qore";
import { getProducts, getProduct } from "./product-actions";

export const productQueries = createQueryKeys("products", (q) => ({
  list: q.scope("list").query(getProducts),
  detail: q.scope("detail").query(
    (id: string) => [id] as const,
    (id) => getProduct(id),
  ),
}));

// entities/product/api/product-cache.ts
import { createCacheStrategy, cacheUpdate } from "qore";
import type { Product } from "../model/product";
import type { UpdateProductParams } from "./product-actions";
import { productQueries } from "./product-queries";

export const updateProductCache = createCacheStrategy<Product, UpdateProductParams>({
  invalidate: (variables) => [
    productQueries._def,
    productQueries.detail(variables.id).queryKey,
  ],
  optimistic: [
    cacheUpdate(productQueries.list, (v, old) =>
      (old ?? []).map((p) => (p.id === v.id ? { ...p, name: v.name } : p)),
    ),
    cacheUpdate(
      (v: UpdateProductParams) => productQueries.detail(v.id),
      (v, old) => old ? { ...old, name: v.name } : old,
    ),
  ],
});

// entities/product/api/product-mutations.ts
import { withCacheStrategy } from "qore";
import { updateProduct } from "./product-actions";
import { updateProductCache } from "./product-cache";

export const updateProductMutation = withCacheStrategy(updateProduct, updateProductCache);

// entities/product/index.ts
export type { Product } from "./model/product";
export { productQueries } from "./api/product-queries";
export { updateProductMutation } from "./api/product-mutations";
```

Now both pages import from the entity's public API:

```tsx
// pages/products/ui/ProductListPage.tsx
import { useQuery } from "@tanstack/react-query";
import { productQueries } from "@/entities/product";

// pages/product-detail/ui/ProductDetailPage.tsx
import { useQuery, useMutation } from "@tanstack/react-query";
import { productQueries, updateProductMutation } from "@/entities/product";
```

---

## API Reference

### `createApiClient(options)`

Creates a configured `ky` HTTP client instance.

```ts
type ApiClientOptions = {
  prefixUrl: string;            // Base URL for all requests
  middleware?: ApiMiddleware[];  // Custom middleware (appended after built-in)
  options?: ky.Options;         // Raw ky options (override anything)
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

  // Optimistic updates — applied before server responds, rolled back on error
  optimistic?: readonly {
    queryKey: (variables: TVariables) => readonly unknown[];
    updater: (variables: TVariables, old: unknown) => unknown;
  }[];

  // Queries to prefetch after success
  prefetch?: (
    variables: TVariables,
    data: TData,
  ) => readonly {
    queryKey: readonly unknown[];
    queryFn?: QueryFunction | SkipToken;
  }[];
};
```

---

### `cacheUpdate(query, updater)`

Type-safe factory for optimistic update targets. Infers the cached data type from the query's `queryFn`, so `old` in the updater is properly typed without manual `as` casts.

```ts
import { cacheUpdate } from "qore";

// Static query — old is inferred as Product[] | undefined
cacheUpdate(productQueries.list, (v, old) =>
  (old ?? []).map((p) => (p.id === v.id ? { ...p, name: v.name } : p)),
)

// Parameterized query — old is inferred as Product | undefined
cacheUpdate(
  (v: UpdateProductParams) => productQueries.detail(v.id),
  (v, old) => old ? { ...old, name: v.name } : old,
)
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

## Layer Responsibilities

| Layer              | What goes here                               | Uses from qore                                                  |
|--------------------|----------------------------------------------|-----------------------------------------------------------------|
| `shared/api/`     | Client instance, endpoints                   | `createApiClient`, `setLogLevel`                                |
| `pages/*/api/`    | Page-local actions, queries, cache, mutations | `createQueryKeys`, `createCacheStrategy`, `cacheUpdate`, `withCacheStrategy` |
| `entities/*/api/` | Extracted when shared by 2+ pages            | Same as pages                                                   |
| `app/`            | QueryClient registration                     | `setQueryClient`                                                |

---

## Peer Dependencies

| Package | Version |
|---------|---------|
| `ky` | >= 1.0.0 |
| `consola` | >= 3.0.0 |
| `@tanstack/react-query` | >= 5.0.0 |

## License

Private package.
