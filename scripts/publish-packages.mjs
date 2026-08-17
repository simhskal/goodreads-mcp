import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coreName = "@organized-chaos/goodreads-mcp-core";
const packages = [
  { directory: "packages/core", name: coreName },
  {
    directory: "packages/server-local",
    name: "@organized-chaos/goodreads-mcp",
  },
];

const outputDirectory = mkdtempSync(join(tmpdir(), "goodreads-mcp-release-"));

function run(command, args, options = {}) {
  const output = execFileSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });
  return typeof output === "string" ? output.trim() : "";
}

function readPackageManifest(directory) {
  return JSON.parse(
    readFileSync(join(root, directory, "package.json"), "utf8"),
  );
}

function pack(directory) {
  const before = new Set(readdirSync(outputDirectory));
  run("pnpm", ["pack", "--pack-destination", outputDirectory], {
    cwd: join(root, directory),
    stdio: "inherit",
  });
  const tarballs = readdirSync(outputDirectory)
    .filter((entry) => entry.endsWith(".tgz") && !before.has(entry))
    .map((entry) => join(outputDirectory, entry));
  if (tarballs.length !== 1) {
    throw new Error(
      `Expected one tarball for ${directory}, found ${tarballs.length}.`,
    );
  }
  return tarballs[0];
}

function readPackedManifest(tarball) {
  return JSON.parse(run("tar", ["-xOf", tarball, "package/package.json"]));
}

function assertManifest(manifest, expectedName) {
  if (manifest.name !== expectedName) {
    throw new Error(`Expected ${expectedName}, found ${manifest.name}.`);
  }
  if (manifest.version === "0.1.0" && process.env.RELEASE_DRY_RUN !== "1") {
    throw new Error("Refusing to publish the superseded 0.1.0 release.");
  }
  if (manifest.publishConfig?.access !== "public") {
    throw new Error(`${manifest.name} must declare public publish access.`);
  }
  if (JSON.stringify(manifest).includes("workspace:")) {
    throw new Error(`${manifest.name} still contains a workspace dependency.`);
  }
}

function isPublished(name, version) {
  try {
    run("npm", ["view", `${name}@${version}`, "version", "--json"]);
    return true;
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`;
    if (/E404|No match found|notarget/i.test(output)) return false;
    throw error;
  }
}

try {
  for (const { directory, name } of packages) {
    const sourceManifest = readPackageManifest(directory);
    if (sourceManifest.name !== name) {
      throw new Error(`Source package ${directory} is not named ${name}.`);
    }

    const tarball = pack(directory);
    const packedManifest = readPackedManifest(tarball);
    assertManifest(packedManifest, name);

    if (name === "@organized-chaos/goodreads-mcp") {
      const coreVersion = packedManifest.dependencies?.[coreName];
      if (!coreVersion || coreVersion.startsWith("workspace:")) {
        throw new Error("The CLI does not have a concrete core dependency.");
      }
      if (
        !isPublished(coreName, coreVersion) &&
        process.env.RELEASE_DRY_RUN !== "1"
      ) {
        throw new Error(
          `${coreName}@${coreVersion} must publish before the CLI.`,
        );
      }
      const bin = packedManifest.bin?.["goodreads-mcp"];
      if (bin !== "dist/index.js") {
        throw new Error("The CLI tarball is missing the goodreads-mcp binary.");
      }
    }

    if (isPublished(name, packedManifest.version)) {
      console.log(
        `${name}@${packedManifest.version} already exists; skipping.`,
      );
      continue;
    }

    if (process.env.RELEASE_DRY_RUN === "1") {
      console.log(`Dry run: would publish ${name}@${packedManifest.version}.`);
    } else {
      console.log(`Publishing ${name}@${packedManifest.version}...`);
      run("npm", ["publish", tarball, "--access", "public"], {
        stdio: "inherit",
      });
    }
  }
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}
