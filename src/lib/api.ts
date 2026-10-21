import { z } from 'zod';

import { getToken } from '@/lib/token';

/** The API base URL. Defined here and nowhere else. */
export const API_BASE_URL = 'https://task-api.cashmine.io';

/**
 * - network: no HTTP response at all (offline, DNS, CORS, connection dropped)
 * - http: the server answered with a non-2xx status
 * - invalid_response: a 2xx whose body is not JSON or does not match the schema
 */
export type ApiErrorKind = 'network' | 'http' | 'invalid_response';

type ApiErrorInit = {
  kind: ApiErrorKind;
  status?: number;
  code?: string;
  field?: string;
  retryAfterMs?: number;
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly field?: string;
  readonly retryAfterMs?: number;

  constructor(message: string, init: ApiErrorInit) {
    super(message);
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.field = init.field;
    this.retryAfterMs = init.retryAfterMs;
  }
}

// `field` is only sent for VALIDATION errors that point at one field, and
// `retryAfterMs` only for RATE_LIMITED, so both are optional.
const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    field: z.string().optional(),
    retryAfterMs: z.number().optional(),
  }),
});

type RequestOptions = {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Overrides the stored token, e.g. to check a token before saving it. */
  token?: string;
};

async function request<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers, signal } = options;
  const token = options.token ?? getToken();

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      signal,
      headers: {
        accept: 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError('Network error. Check your connection.', { kind: 'network' });
  }

  if (!response.ok) {
    throw await toHttpError(response);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiError('Unexpected response from server.', { kind: 'invalid_response', status: response.status });
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError('Unexpected response from server.', { kind: 'invalid_response', status: response.status });
  }
  return parsed.data;
}

async function toHttpError(response: Response): Promise<ApiError> {
  const parsed = ErrorEnvelopeSchema.safeParse(await response.json().catch(() => null));
  const envelope = parsed.success ? parsed.data.error : undefined;
  return new ApiError(envelope?.message ?? `Request failed (${response.status})`, {
    kind: 'http',
    status: response.status,
    code: envelope?.code,
    field: envelope?.field,
    retryAfterMs: envelope?.retryAfterMs ?? retryAfterHeaderMs(response.headers.get('retry-after')),
  });
}

/** Retry-After in seconds (the only form the API documents). */
function retryAfterHeaderMs(header: string | null): number | undefined {
  return header && /^\d+$/.test(header) ? Number(header) * 1000 : undefined;
}

export function apiGet<T>(
  path: string,
  schema: z.ZodType<T>,
  options: Pick<RequestOptions, 'signal' | 'token'> = {},
): Promise<T> {
  return request(path, schema, options);
}

export function apiPost<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  options: Pick<RequestOptions, 'headers' | 'signal'> = {},
): Promise<T> {
  return request(path, schema, { ...options, method: 'POST', body });
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

/**
 * Query retry policy: retry what can get better on its own (network errors,
 * 429, 5xx); never retry 4xx or a response that failed validation.
 * Not used for POST /v1/claims, which has its own rules.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2 || !(error instanceof ApiError)) return false;
  if (error.kind === 'network') return true;
  if (error.kind === 'invalid_response') return false;
  return error.status === 429 || (error.status ?? 0) >= 500;
}

export function queryRetryDelay(failureCount: number, error: unknown): number {
  if (error instanceof ApiError && error.retryAfterMs !== undefined) return error.retryAfterMs;
  return Math.min(1000 * 2 ** failureCount, 8000);
}
