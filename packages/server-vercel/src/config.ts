const LOOPBACK_URL = "http://localhost:3000";

export function publicBaseUrl(): string {
  const explicit =
    process.env.BETTER_AUTH_URL ?? process.env.GOODREADS_MCP_BASE_URL;
  if (explicit) return stripTrailingSlash(explicit);

  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelHost) return `https://${stripTrailingSlash(vercelHost)}`;

  if (process.env.NODE_ENV !== "production") return LOOPBACK_URL;
  throw new Error("Set BETTER_AUTH_URL to the public deployment origin.");
}

export const authBasePath = "/api/auth";

export function authIssuer(): string {
  return `${publicBaseUrl()}${authBasePath}`;
}

export function mcpResource(): string {
  return `${publicBaseUrl()}/oauth/mcp`;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
