import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { openAuth } from "../packages/server-vercel/src/auth.js";

let metadata: ReturnType<typeof oauthProviderAuthServerMetadata> | undefined;

export function GET(request: Request) {
  const ready = openAuth();
  if (!ready.ok) return ready.response;
  metadata ??= oauthProviderAuthServerMetadata(
    ready.auth as unknown as Parameters<
      typeof oauthProviderAuthServerMetadata
    >[0],
  );
  return metadata(request);
}

// Preflight must be a 2xx. CORS headers for this route come from vercel.json
// so they are not duplicated with the handler response.
export const OPTIONS = () => new Response(null, { status: 204 });
