import { next } from "@vercel/functions";
import {
  ABUSE_MATCHER,
  abuseCheckValue,
  abuseHandoffSecret,
  abuseSurface,
  enforceObserved,
  openAbuseStore,
} from "./packages/server-vercel/src/abuse.js";

export const config = {
  runtime: "nodejs",
  matcher: [...ABUSE_MATCHER],
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
