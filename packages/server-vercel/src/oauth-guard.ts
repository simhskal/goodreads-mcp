export const REQUIRED_OAUTH_ENV = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GOODREADS_CREDENTIAL_KEY",
] as const;

export type RequiredOAuthEnv = (typeof REQUIRED_OAUTH_ENV)[number];

const NO_STORE = { "cache-control": "no-store" } as const;

let reportedMessage: string | undefined;

export function missingOAuthEnv(
  env: NodeJS.ProcessEnv = process.env,
): RequiredOAuthEnv[] {
  return REQUIRED_OAUTH_ENV.filter((name) => !env[name]?.trim());
}

export function oauthConfigMessage(missing: readonly string[]): string {
  return [
    "Goodreads MCP OAuth cannot start.",
    `Missing environment: ${missing.join(", ")}.`,
    "Set DATABASE_URL to the Postgres connection string, BETTER_AUTH_URL to the public origin (for example https://goodreads-mcp-chi.vercel.app), BETTER_AUTH_SECRET to a long random secret, and GOODREADS_CREDENTIAL_KEY to a base64-encoded 32-byte key.",
    "Apply migrations/0001_better_auth.sql and migrations/0002_goodreads_storage.sql, then redeploy.",
  ].join(" ");
}

export function reportOAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const missing = missingOAuthEnv(env);
  if (missing.length === 0) return undefined;
  const message = oauthConfigMessage(missing);
  if (reportedMessage !== message) {
    reportedMessage = message;
    console.error(message);
  }
  return message;
}

export function oauthUnavailableResponse(
  env: NodeJS.ProcessEnv = process.env,
): Response | undefined {
  const message = reportOAuthConfig(env);
  if (!message) return undefined;
  return Response.json(
    {
      error: "oauth_unavailable",
      message,
      missing: missingOAuthEnv(env),
    },
    { status: 503, headers: NO_STORE },
  );
}

const runningTests =
  process.env.VITEST === "true" || process.env.NODE_ENV === "test";

if (!runningTests) {
  reportOAuthConfig();
}
