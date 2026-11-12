import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "../packages/server-vercel/src/auth.js";

export const GET = oauthProviderAuthServerMetadata(
  auth as unknown as Parameters<typeof oauthProviderAuthServerMetadata>[0],
);

// Preflight must be a 2xx. CORS headers for this route come from vercel.json
// so they are not duplicated with the handler response.
export const OPTIONS = () => new Response(null, { status: 204 });
