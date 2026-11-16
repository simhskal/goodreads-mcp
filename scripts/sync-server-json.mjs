import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function syncServerJsonVersions(serverJson, version) {
  if (typeof version !== "string" || version.trim() === "") {
    throw new Error(
      "packages/server-local/package.json is missing a version to copy into server.json.",
    );
  }
  if (!Array.isArray(serverJson.packages) || serverJson.packages.length === 0) {
    throw new Error("server.json must include at least one package.");
  }

  const next = structuredClone(serverJson);
  next.version = version;
  for (const entry of next.packages) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("server.json packages must be objects.");
    }
    entry.version = version;
  }
  return next;
}

function readOption(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function syncServerJsonFile({ packageJsonPath, serverJsonPath }) {
  const packageJson = readJson(packageJsonPath);
  const serverJson = readJson(serverJsonPath);
  const next = syncServerJsonVersions(serverJson, packageJson.version);
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  const current = readFileSync(serverJsonPath, "utf8");
  if (current !== serialized) {
    writeFileSync(serverJsonPath, serialized);
  }
  return next;
}

function isDirectRun() {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  syncServerJsonFile({
    packageJsonPath:
      readOption("--package") ??
      resolve(root, "packages/server-local/package.json"),
    serverJsonPath: readOption("--server") ?? resolve(root, "server.json"),
  });
}
