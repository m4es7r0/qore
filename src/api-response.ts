/**
 * Standard API response types.
 *
 * These types describe the expected shape of JSON responses from REST APIs.
 * Customize or extend them to match your backend's contract.
 *
 * @example
 * ```ts
 * // Your backend returns: { data: User, meta: { ... } }
 * const response = await api.get("users/1").json<ApiResponse<User>>();
 * console.log(response.data); // User
 * ```
 */

/**
 * Wraps the actual payload `T` in a standard envelope.
 *
 * @example
 * ```ts
 * type UsersResponse = ApiResponse<User[]>;
 * // { data: User[]; meta?: Record<string, unknown> }
 * ```
 */
export type ApiResponse<T> = {
  data: T;
  meta?: Record<string, unknown>;
};

/**
 * Standard error body returned by the API.
 *
 * @example
 * ```ts
 * // Backend returns:
 * // { message: "Not found", code: "RESOURCE_NOT_FOUND", status: 404 }
 * ```
 */
export type ApiErrorBody = {
  message: string;
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
};

/**
 * Paginated response with cursor/offset metadata.
 *
 * @example
 * ```ts
 * const res = await api.get("posts").json<PaginatedResponse<Post>>();
 * console.log(res.meta.page);       // 1
 * console.log(res.meta.totalPages); // 5
 * ```
 */
export type PaginatedResponse<T> = ApiResponse<T> & {
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
};
