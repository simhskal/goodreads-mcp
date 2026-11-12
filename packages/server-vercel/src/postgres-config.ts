import { rootCertificates } from "node:tls";
import type { ClientConfig, PoolConfig } from "pg";
import { SUPABASE_ROOT_CA } from "./supabase-ca.js";

const INVALID_CONNECTION_STRING = "Invalid Postgres connection string.";

export function sanitizeDbMessage(error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Database operation failed.";
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted-url]")
    .replace(/(\/\/)[^/\s:]+:[^@\s/]+@/g, "$1[redacted]@")
    .replace(/\b(password|sslpassword)=([^\s&]+)/gi, "$1=[redacted]");
}

export function postgresClientConfig(connectionString: string): ClientConfig {
  const url = parsePostgresUrl(connectionString);
  const sslmode = url.searchParams.get("sslmode")?.toLowerCase() ?? null;
  const host = url.hostname;
  const port = url.port ? Number(url.port) : 5432;
  const user = decodeComponent(url.username);
  const password = decodeComponent(url.password);
  const database = decodeComponent(url.pathname.replace(/^\/+|\/+$/g, ""));
  if (
    !host ||
    !user ||
    !database ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(INVALID_CONNECTION_STRING);
  }

  const config: ClientConfig = {
    host,
    port,
    user,
    database,
    password,
  };
  const ssl = sslConfig(host, sslmode);
  if (ssl !== undefined) config.ssl = ssl;
  return config;
}

// One pooled connection per warm serverless instance. Supavisor transaction
// mode (port 6543) is the runtime URL. Named prepared statements and query
// pipelining are left off: node-postgres names a statement only when `query`
// is given a `name`, and `pipeline` is opt-in. Kysely and this server call
// `query(sql, values)` without a name.
export function serverlessPoolConfig(connectionString: string): PoolConfig {
  return {
    ...postgresClientConfig(connectionString),
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    allowExitOnIdle: true,
    keepAlive: true,
  };
}

export function migrationClientConfig(connectionString: string): ClientConfig {
  return {
    ...postgresClientConfig(connectionString),
    connectionTimeoutMillis: 20_000,
    query_timeout: 120_000,
  };
}

function parsePostgresUrl(connectionString: string): URL {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(INVALID_CONNECTION_STRING);
  }
  const protocol = url.protocol.slice(0, -1);
  if (protocol !== "postgres" && protocol !== "postgresql") {
    throw new Error(INVALID_CONNECTION_STRING);
  }
  return url;
}

function decodeComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new Error(INVALID_CONNECTION_STRING);
  }
}

function sslConfig(
  host: string,
  sslmode: string | null,
): ClientConfig["ssl"] | undefined {
  if (isSupabaseHost(host)) {
    // `ca` replaces Node's trust store. Keep the public roots and add the
    // Supabase root so verify-full succeeds for the pooler chain today and
    // still succeeds if a later certificate is signed by a public CA.
    return {
      ca: [...rootCertificates, SUPABASE_ROOT_CA],
      rejectUnauthorized: true,
    };
  }
  switch (sslmode) {
    case null:
    case "disable":
      return undefined;
    case "allow":
    case "prefer":
    case "require":
    case "no-verify":
      // libpq `require` encrypts without verifying the peer. Passing the
      // original string through would make current node-postgres verify it.
      return { rejectUnauthorized: false };
    case "verify-ca":
    case "verify-full":
      return { rejectUnauthorized: true };
    default:
      return { rejectUnauthorized: true };
  }
}

export function isSupabaseHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.+$/, "");
  return (
    host === "supabase.com" ||
    host.endsWith(".supabase.com") ||
    host === "supabase.co" ||
    host.endsWith(".supabase.co")
  );
}
