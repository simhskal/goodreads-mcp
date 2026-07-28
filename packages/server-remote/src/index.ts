import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { GoodreadsMcp } from "./mcp.js";
import { OnboardingHandler } from "./onboarding.js";

export { GoodreadsMcp };

export default new OAuthProvider({
  apiHandlers: {
    "/mcp": GoodreadsMcp.serve("/mcp"),
  },
  defaultHandler: OnboardingHandler,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  scopesSupported: ["library:read", "account:write"],
  resourceMetadata: {
    scopes_supported: ["library:read", "account:write"],
    bearer_methods_supported: ["header"],
    resource_name: "Goodreads MCP",
  },
});
