/**
 * Tiny, dependency-free fetch wrapper adopted app-wide.
 *
 * `api<T>()` throws a typed {@link ApiError} on any non-ok response, network
 * failure, or 2xx body that is shaped like an error (`{ error: "..." }`). It
 * never hands an error-shaped body back to a caller as if it were success.
 *
 * `tryApi<T>()` is the no-throw ergonomic variant: it returns a discriminated
 * union so call sites can branch without a try/catch.
 *
 * Convention: on a caught ApiError, surface `err.message` via
 * `toast(err.message, "error")`.
 */

export class ApiError extends Error {
  /** HTTP status code, or 0 for a network/transport failure. */
  readonly status: number;
  /** Best-effort parsed response body (may be undefined). */
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    // Restore prototype chain for instanceof across transpile targets.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/** Read and best-effort parse a response body without throwing. */
async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text().catch(() => "");
  if (!text) return undefined;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("json") || text.startsWith("{") || text.startsWith("[")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

/** Pull a `{ error: "..." }` message out of a parsed body, if present. */
function extractErrorMessage(body: unknown): string | undefined {
  if (body && typeof body === "object" && "error" in body) {
    const value = (body as { error: unknown }).error;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * Fetch `input`, throwing {@link ApiError} on failure. Parses and returns the
 * JSON body typed as `T` on success.
 */
export async function api<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch (cause) {
    const message =
      cause instanceof Error && cause.message ? cause.message : "Network request failed";
    throw new ApiError(message, 0, cause);
  }

  const body = await parseBody(res);

  if (!res.ok) {
    const message =
      extractErrorMessage(body) ?? res.statusText ?? `Request failed (${res.status})`;
    throw new ApiError(message, res.status, body);
  }

  // A 2xx response can still carry an error-shaped body; never treat it as success.
  const okError = extractErrorMessage(body);
  if (okError) {
    throw new ApiError(okError, res.status, body);
  }

  return body as T;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

/**
 * No-throw variant of {@link api}. Returns a discriminated union so callers can
 * branch on `result.ok` instead of catching.
 */
export async function tryApi<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await api<T>(input, init) };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err };
    const message = err instanceof Error && err.message ? err.message : "Unknown error";
    return { ok: false, error: new ApiError(message, 0, err) };
  }
}
