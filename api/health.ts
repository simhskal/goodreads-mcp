import { oauthUnavailableResponse } from "../packages/server-vercel/src/oauth-guard.js";

// This route must not import auth or the database. It stays up when OAuth
// configuration is missing so operators can see which variables to set.
export function GET(): Response {
  return (
    oauthUnavailableResponse() ??
    Response.json(
      { status: "ok" },
      { headers: { "cache-control": "no-store" } },
    )
  );
}
