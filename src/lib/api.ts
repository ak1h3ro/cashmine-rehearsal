import type { z } from 'zod';

/**
 * Base URL of the Worker proxy. In production the app and the proxy share an
 * origin, so `/api` is enough; in dev the Expo server runs on :8081 and the
 * proxy on :8787 (`wrangler dev`), set via EXPO_PUBLIC_API_BASE in .env.development.
 */
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiGet<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { headers: { accept: 'application/json' }, signal });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError('Network error. Check your connection.');
  }
  if (!response.ok) {
    throw new ApiError(`Request failed (${response.status})`, response.status);
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError('Unexpected response from server.');
  }
  return parsed.data;
}
