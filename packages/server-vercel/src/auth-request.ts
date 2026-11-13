// Vercel’s filesystem route for `api/auth/[...all].ts` matches one path segment.
// `/api/auth/ok` reaches this function; `/api/auth/oauth2/register` does not, and
// the platform answers with its own NOT_FOUND page. vercel.json rewrites the
// nested paths onto this file after the filesystem check misses. That rewrite
// invokes the function at `/api/auth/[...all]` and appends the unmatched suffix
// as the `authPath` query parameter, so Better Auth would otherwise route the
// destination path and the abuse-check HMAC (computed on the public path) would
// miss. Put the public path back before either of those runs.
const AUTH_FUNCTION_PATH = "/api/auth/[...all]";
const AUTH_PATH_PARAM = "authPath";

export function requestForAuth(request: Request): Request {
  const url = new URL(request.url);
  if (pathnameOf(url) !== AUTH_FUNCTION_PATH) return request;
  const rest = url.searchParams.get(AUTH_PATH_PARAM);
  if (rest == null) return request;
  url.searchParams.delete(AUTH_PATH_PARAM);
  const suffix = rest.replace(/^\/+/, "").replace(/\/+$/, "");
  url.pathname = suffix ? `/api/auth/${suffix}` : "/api/auth";
  return new Request(url, request);
}

function pathnameOf(url: URL): string {
  try {
    return decodeURIComponent(url.pathname);
  } catch {
    return url.pathname;
  }
}
