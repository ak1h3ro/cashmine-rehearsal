/**
 * Worker entry point. Static assets are served by the assets binding; this
 * script only owns /api/*, which it proxies to the upstream API with the
 * secret token attached, so the token never ships in the client bundle.
 */

import type { Env } from './env';

const API_PREFIX = '/api';

// Request headers worth passing upstream. Everything else (cookies, the
// client's own Authorization, CF headers) is dropped.
const FORWARDED_HEADERS = ['accept', 'content-type', 'accept-language'];

const LOCALHOST_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`)) {
      const cors = corsHeaders(request, env);
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: cors });
      }
      const response = await proxy(request, url, env);
      for (const [key, value] of Object.entries(cors)) {
        response.headers.set(key, value);
      }
      return response;
    }

    return env.ASSETS.fetch(request);
  },
};

async function proxy(request: Request, url: URL, env: Env): Promise<Response> {
  const upstreamPath = url.pathname.slice(API_PREFIX.length);
  const target = `${env.UPSTREAM_URL}${upstreamPath}${url.search}`;

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (env.API_TOKEN) {
    headers.set('authorization', `Bearer ${env.API_TOKEN}`);
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: 'follow',
    });
    // Re-wrap so headers are mutable; CORS policy is ours, not the upstream's.
    const response = new Response(upstream.body, upstream);
    for (const name of [...response.headers.keys()]) {
      if (name.startsWith('access-control-')) response.headers.delete(name);
    }
    return response;
  } catch {
    return Response.json({ error: 'upstream_unreachable' }, { status: 502 });
  }
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('origin');
  if (env.DEV_CORS !== '1' || !origin || !LOCALHOST_ORIGIN.test(origin)) {
    return {};
  }
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type, accept',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}
