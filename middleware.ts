import { next } from "@vercel/functions";
import {
  abuseCheckValue,
  abuseHandoffSecret,
  abuseSurface,
  enforceObserved,
  openAbuseStore,
} from "./packages/server-vercel/src/abuse.js";

// Vercel's static config parser rejects array spreads in this export.
export const config = {
  runtime: "nodejs",
  matcher: [
    "/mcp",
    "/mcp/:path*",
    "/api/server",
    "/oauth/mcp",
    "/oauth/mcp/:path*",
    "/api/oauth-mcp",
    "/connect",
    "/api/connect",
    "/api/auth",
    "/api/auth/:path*",
  ],
};

export default async function middleware(request: Request): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  const secret = abuseHandoffSecret();
  if (
    !secret ||
    request.method.toUpperCase() === "OPTIONS" ||
    !abuseSurface(pathname)
  ) {
    return next();
  }

  const denied = await enforceObserved(request, openAbuseStore());
  if (denied) return denied;

  const headers = new Headers(request.headers);
  headers.set(
    "x-goodreads-abuse-check",
    abuseCheckValue(request.method, pathname, secret),
  );
  return next({
    request: { headers },
  });
}
