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

export function authSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET must be set to a string of at least 32 characters.",
    );
  }
  return secret;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
