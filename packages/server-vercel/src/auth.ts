import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { anonymous, jwt } from "better-auth/plugins";
import {
  authBasePath,
  authSecret,
  mcpResource,
  publicBaseUrl,
} from "./config.js";
import { getAuthDatabase, getPool } from "./db.js";
import {
  missingOAuthEnv,
  oauthConfigMessage,
  oauthUnavailableResponse,
} from "./oauth-guard.js";
import { LibraryRepository } from "./repository.js";

const scopes = [
  "openid",
  "profile",
  "offline_access",
  "library:read",
  "account:write",
] as const;

function createAuth() {
  const missing = missingOAuthEnv();
  if (missing.length > 0) throw new Error(oauthConfigMessage(missing));

  return betterAuth({
    appName: "Goodreads MCP",
    baseURL: publicBaseUrl(),
    basePath: authBasePath,
    database: getAuthDatabase(),
    secret: authSecret(),
    plugins: [
      anonymous({ disableDeleteAnonymousUser: true }),
      jwt(),
      mcp({
        loginPage: "/sign-in",
        consentPage: "/consent",
        resource: mcpResource(),
        scopes: [...scopes],
        resources: [{ identifier: mcpResource(), allowedScopes: [...scopes] }],
        clientRegistrationDefaultResources: [mcpResource()],
        clientRegistrationDefaultScopes: [...scopes],
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: "infer",
        postLogin: {
          page: "/connect",
          consentReferenceId: ({ user }) => user.id,
          shouldRedirect: async ({ user }) => {
            const profile = await new LibraryRepository(getPool()).profile(
              user.id,
            );
            return !profile;
          },
        },
      }) as unknown as BetterAuthPlugin,
      cimd({
        fetchClientMetadataResource,
        metadataProfile: "mcp-2026-07-28",
      }),
    ],
  });
}

export type GoodreadsAuth = ReturnType<typeof createAuth>;

let authInstance: GoodreadsAuth | undefined;

// Build Better Auth on first use. Constructing it at import time calls
// getPool() and crashes the Vercel isolate when DATABASE_URL is unset.
export function getAuth(): GoodreadsAuth {
  if (!authInstance) authInstance = createAuth();
  return authInstance;
}

export function openAuth():
  { ok: true; auth: GoodreadsAuth } | { ok: false; response: Response } {
  const unavailable = oauthUnavailableResponse();
  if (unavailable) return { ok: false, response: unavailable };
  try {
    return { ok: true, auth: getAuth() };
  } catch (error) {
    console.error(
      "Goodreads MCP OAuth failed to start.",
      error instanceof Error ? error.name : "Error",
      sanitizeLogMessage(
        error instanceof Error ? error.message : "unknown error",
      ),
    );
    return {
      ok: false,
      response: Response.json(
        {
          error: "oauth_unavailable",
          message:
            "Goodreads MCP OAuth failed to start. Check the server logs.",
        },
        { status: 503, headers: { "cache-control": "no-store" } },
      ),
    };
  }
}

function sanitizeLogMessage(message: string): string {
  return message.replace(/\/\/[^/\s:]+:[^@\s/]+@/g, "//[redacted]@");
}
