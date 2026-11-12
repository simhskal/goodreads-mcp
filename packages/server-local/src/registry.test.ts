import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");

interface PackageJson {
  name: string;
  version: string;
  mcpName?: string;
}

interface ServerJson {
  $schema: string;
  name: string;
  description: string;
  version: string;
  packages: Array<{
    registryType: string;
    registryBaseUrl?: string;
    identifier: string;
    version: string;
    transport: { type: string };
  }>;
  remotes: Array<{ type: string; url: string }>;
}

const packageJson = JSON.parse(
  readFileSync(resolve(packageRoot, "package.json"), "utf8"),
) as PackageJson;

const serverJson = JSON.parse(
  readFileSync(resolve(repoRoot, "server.json"), "utf8"),
) as ServerJson;

describe("MCP registry metadata", () => {
  it("matches the published npm package and hosted endpoint", () => {
    expect(packageJson.mcpName).toBe("io.github.chaosorganized/goodreads-mcp");
    expect(serverJson.name).toBe(packageJson.mcpName);
    expect(serverJson.$schema).toBe(
      "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
    );
    expect(serverJson.description.length).toBeGreaterThan(0);
    expect(serverJson.description.length).toBeLessThanOrEqual(100);
    expect(serverJson.version).toBe(packageJson.version);
    expect(serverJson.packages[0]).toMatchObject({
      registryType: "npm",
      registryBaseUrl: "https://registry.npmjs.org",
      identifier: packageJson.name,
      version: packageJson.version,
      transport: { type: "stdio" },
    });
    expect(serverJson.remotes).toEqual([
      {
        type: "streamable-http",
        url: "https://goodreads-mcp-chi.vercel.app/oauth/mcp",
      },
    ]);
  });
});
