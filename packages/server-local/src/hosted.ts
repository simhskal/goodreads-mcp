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

export function sharedDeploymentMcpResponse(
  env: NodeJS.ProcessEnv = process.env,
): Response | undefined {
  if (!isSharedPublicDeployment(env)) return undefined;
  const endpoint = DEFAULT_REMOTE_ENDPOINT;
  return Response.json(
    {
      error: "deprecated",
      message: `The public /mcp endpoint is disabled on this shared deployment. Connect your MCP client to ${endpoint} and sign in. Do not send a Goodreads RSS key in request headers.`,
      endpoint,
    },
    {
      status: 410,
      headers: {
        "cache-control": "no-store",
        link: `<${endpoint}>; rel="successor-version"`,
      },
    },
  );
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
