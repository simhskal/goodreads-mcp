const SHARED_DEPLOYMENT_HOSTS = new Set([
  "goodreads-mcp-chi.vercel.app",
  "goodreads-mcp-organized-chaos.vercel.app",
  "goodreads-mcp-git-main-organized-chaos.vercel.app",
]);

export const DEFAULT_REMOTE_ENDPOINT =
  "https://goodreads-mcp-chi.vercel.app/oauth/mcp";

export function endpointAcceptsClientRssKey(endpoint: string): boolean {
  try {
    return !SHARED_DEPLOYMENT_HOSTS.has(new URL(endpoint).host.toLowerCase());
  } catch {
    return false;
  }
}

export function isSharedPublicDeployment(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const host = normalizeHost(env.VERCEL_PROJECT_PRODUCTION_URL);
  return host !== undefined && SHARED_DEPLOYMENT_HOSTS.has(host);
}

function oauthMcpRedirectLocation(requestUrl?: string): string {
  if (!requestUrl) return "/oauth/mcp";
  try {
    const incoming = new URL(requestUrl);
    return `${incoming.origin}/oauth/mcp${incoming.search}`;
  } catch {
    return "/oauth/mcp";
  }
}

export function sharedDeploymentMcpResponse(
  request?: Pick<Request, "url">,
  env: NodeJS.ProcessEnv = process.env,
): Response | undefined {
  if (!isSharedPublicDeployment(env)) return undefined;
  // 308 keeps the method and body. The query string is copied onto /oauth/mcp.
  return new Response(null, {
    status: 308,
    headers: {
      location: oauthMcpRedirectLocation(request?.url),
    },
  });
}

function normalizeHost(value: string | undefined): string | undefined {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed) return undefined;
  try {
    const withProtocol = trimmed.includes("://")
      ? trimmed
      : `https://${trimmed}`;
    return new URL(withProtocol).host.toLowerCase();
  } catch {
    return undefined;
  }
}
