import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { anonymous, jwt } from "better-auth/plugins";
import { authBasePath, mcpResource, publicBaseUrl } from "./config.js";
import { getAuthDatabase, getDatabase } from "./db.js";
import { LibraryRepository } from "./repository.js";

const scopes = [
  "openid",
  "profile",
  "offline_access",
  "library:read",
  "account:write",
] as const;

export const auth = betterAuth({
  appName: "Goodreads MCP",
  baseURL: publicBaseUrl(),
  basePath: authBasePath,
  database: getAuthDatabase(),
  secret: process.env.BETTER_AUTH_SECRET,
  plugins: [
    anonymous({
      // Hosted accounts stay anonymous. The plugin would delete them when a
      // later sign-in links over the session, and its delete endpoint does
      // not remove stored library data. Unused anonymous users are purged
      // by the daily cron instead.
      disableDeleteAnonymousUser: true,
    }),
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
      // MCP clients register before the reader signs in. Registration stays
      // open to those clients, with per-IP throttles and a purge of clients
      // that never receive a grant.
      allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultApplicationType: "infer",
      postLogin: {
        page: "/connect",
        consentReferenceId: ({ user }) => user.id,
        shouldRedirect: async ({ user }) => {
          const profile = await new LibraryRepository(getDatabase()).profile(
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
