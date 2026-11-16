import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
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

  it("copies the package version into server.json from the changesets version script", () => {
    const rootPackage = JSON.parse(
      readFileSync(resolve(repoRoot, "package.json"), "utf8"),
    ) as { scripts: { version: string } };
    const releaseWorkflow = readFileSync(
      resolve(repoRoot, ".github/workflows/release.yml"),
      "utf8",
    );

    expect(rootPackage.scripts.version).toBe(
      "changeset version && node scripts/sync-server-json.mjs",
    );
    expect(releaseWorkflow).toContain("version-script: pnpm run version");
  });
});

describe("sync-server-json", () => {
  const scriptPath = resolve(repoRoot, "scripts/sync-server-json.mjs");

  function writeFixture(directory: string, version: string) {
    const packageJsonPath = join(directory, "package.json");
    const serverJsonPath = join(directory, "server.json");
    writeFileSync(
      packageJsonPath,
      `${JSON.stringify({ name: "@organized-chaos/goodreads-mcp", version }, null, 2)}\n`,
    );
    writeFileSync(
      serverJsonPath,
      `${JSON.stringify(
        {
          name: "io.github.chaosorganized/goodreads-mcp",
          description: "Kept while versions sync.",
          version: "0.0.1",
          packages: [
            {
              registryType: "npm",
              identifier: "@organized-chaos/goodreads-mcp",
              version: "0.0.1",
            },
            {
              registryType: "oci",
              identifier: "ghcr.io/example/goodreads-mcp",
              version: "0.0.2",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    return { packageJsonPath, serverJsonPath };
  }

  it("updates the manifest version and every package version", () => {
    const directory = mkdtempSync(join(tmpdir(), "goodreads-mcp-registry-"));
    try {
      const { packageJsonPath, serverJsonPath } = writeFixture(
        directory,
        "0.2.1",
      );
      execFileSync(
        process.execPath,
        [scriptPath, "--package", packageJsonPath, "--server", serverJsonPath],
        { encoding: "utf8" },
      );
      const synced = JSON.parse(readFileSync(serverJsonPath, "utf8")) as {
        description: string;
        version: string;
        packages: Array<{ version: string }>;
      };

      expect(synced.version).toBe("0.2.1");
      expect(synced.packages.map((entry) => entry.version)).toEqual([
        "0.2.1",
        "0.2.1",
      ]);
      expect(synced.description).toBe("Kept while versions sync.");

      const formatted = readFileSync(serverJsonPath, "utf8");
      execFileSync(
        process.execPath,
        [scriptPath, "--package", packageJsonPath, "--server", serverJsonPath],
        { encoding: "utf8" },
      );
      expect(readFileSync(serverJsonPath, "utf8")).toBe(formatted);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails when the package version is missing", () => {
    const directory = mkdtempSync(join(tmpdir(), "goodreads-mcp-registry-"));
    try {
      const { packageJsonPath, serverJsonPath } = writeFixture(directory, "");
      const result = spawnSync(
        process.execPath,
        [scriptPath, "--package", packageJsonPath, "--server", serverJsonPath],
        { encoding: "utf8" },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("missing a version");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
