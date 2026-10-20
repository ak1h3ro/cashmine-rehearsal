/**
 * Bindings available to the Worker. Declared locally so the project does not
 * need @cloudflare/workers-types as a dependency.
 */
export interface Env {
  /** Static assets produced by `expo export -p web`, bound in wrangler.toml. */
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Upstream API base URL without a trailing slash, e.g. https://api.example.com/v1. */
  UPSTREAM_URL: string;
  /** API token, stored as a Worker secret (`wrangler secret put API_TOKEN`). */
  API_TOKEN?: string;
  /** Set to "1" in .dev.vars only: lets the Expo dev server on localhost call the proxy. */
  DEV_CORS?: string;
}
