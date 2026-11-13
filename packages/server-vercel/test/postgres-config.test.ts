import { X509Certificate } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  isSupabaseHost,
  migrationClientConfig,
  postgresClientConfig,
  sanitizeDbMessage,
  serverlessPoolConfig,
} from "../src/postgres-config.js";
import { SUPABASE_ROOT_CA } from "../src/supabase-ca.js";

const POOLER =
  "postgresql://postgres.ref:s3cret-token@aws-1-us-west-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x";

describe("Supabase root CA", () => {
  it("is the published Supabase Root 2021 certificate", () => {
    const certificate = new X509Certificate(SUPABASE_ROOT_CA);
    expect(certificate.fingerprint256).toBe(
      "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA",
    );
    expect(certificate.subject).toContain("Supabase Root 2021 CA");
    expect(certificate.validTo).toBeTruthy();
  });
});

describe("Postgres connection config", () => {
  it("verifies the Supabase pooler with its CA and drops driver-hostile query params", () => {
    const config = postgresClientConfig(POOLER);
    expect(config.host).toBe("aws-1-us-west-1.pooler.supabase.com");
    expect(config.port).toBe(6543);
    expect(config.user).toBe("postgres.ref");
    expect(config.password).toBe("s3cret-token");
    expect(config.database).toBe("postgres");
    expect(config).not.toHaveProperty("connectionString");
    expect(config).not.toHaveProperty("supa");
    expect(config).not.toHaveProperty("sslmode");

    const serialized = JSON.stringify(config);
    expect(serialized).not.toContain("base-pooler.x");
    expect(serialized).not.toContain("sslmode");

    expect(config.ssl).toMatchObject({ rejectUnauthorized: true });
    const ca = (config.ssl as { ca: string[] }).ca;
    expect(ca).toContain(SUPABASE_ROOT_CA);
    expect(ca.length).toBeGreaterThan(1);
  });

  it("decodes percent-encoded userinfo without keeping the raw URL", () => {
    const config = postgresClientConfig(
      "postgres://postgres.ref:p%40ss%3Aword@db.example.supabase.co:5432/postgres",
    );
    expect(config.user).toBe("postgres.ref");
    expect(config.password).toBe("p@ss:word");
    expect(config.port).toBe(5432);
  });

  it("does not force TLS for a non-Supabase URL without sslmode", () => {
    const config = postgresClientConfig(
      "postgres://reader@127.0.0.1:5432/library",
    );
    expect(config.ssl).toBeUndefined();
    expect(config.host).toBe("127.0.0.1");
    expect(isSupabaseHost("127.0.0.1")).toBe(false);
    expect(isSupabaseHost("notsupabase.com")).toBe(false);
    expect(isSupabaseHost("pooler.supabase.com.evil.example")).toBe(false);
  });

  it("keeps libpq require semantics for hosts that are not Supabase", () => {
    const config = postgresClientConfig(
      "postgres://reader:s3cret@db.example:5432/library?sslmode=require",
    );
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(JSON.stringify(config)).not.toContain("sslmode");
  });

  it("rejects unusable URLs without echoing them", () => {
    expect(() =>
      postgresClientConfig("http://user:s3cret@example.com/library"),
    ).toThrow(/^Invalid Postgres connection string\.$/);
    expect(() => postgresClientConfig("not a url s3cret")).toThrow(
      /^Invalid Postgres connection string\.$/,
    );
  });

  it("uses one serverless connection and does not enable pipelining", () => {
    const config = serverlessPoolConfig(POOLER);
    expect(config.max).toBe(1);
    expect(config.idleTimeoutMillis).toBe(10_000);
    expect(config.connectionTimeoutMillis).toBe(15_000);
    expect(config.allowExitOnIdle).toBe(true);
    expect(config.keepAlive).toBe(true);
    expect(config).not.toHaveProperty("pipeline");
  });

  it("gives migrations a bounded client without a pool", () => {
    const config = migrationClientConfig(POOLER);
    expect(config.connectionTimeoutMillis).toBe(20_000);
    expect(config.query_timeout).toBe(120_000);
    expect(config).not.toHaveProperty("max");
    expect(config.ssl).toMatchObject({ rejectUnauthorized: true });
  });
});

describe("database error redaction", () => {
  it("removes connection strings and passwords from log text", () => {
    const message = sanitizeDbMessage(
      new Error(
        "connect failed postgres://user:s3cret-token@aws-1-us-west-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x password=s3cret-token",
      ),
    );
    expect(message).not.toContain("s3cret-token");
    expect(message).not.toContain("base-pooler.x");
    expect(message).not.toContain("postgres://");
    expect(message).toContain("[redacted-url]");
    expect(message).toContain("password=[redacted]");
  });
});
