import { pathToFileURL } from "node:url";

const versionManifest = /^packages\/[^/]+\/package\.json$/;

export function releasePreviewNeeded({ headRef, changedPaths }) {
  if (headRef === "changeset-release/main") return true;
  return changedPaths.some(
    (path) => path === "server.json" || versionManifest.test(path),
  );
}

function isDirectRun() {
  const entry = process.argv[1];
  return entry !== undefined && import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  const changedPaths = [];
  const input = await new Response(process.stdin).text();
  for (const line of input.split("\n")) {
    const path = line.trim();
    if (path) changedPaths.push(path);
  }
  const needed = releasePreviewNeeded({
    headRef: process.env.RELEASE_HEAD_REF ?? "",
    changedPaths,
  });
  process.stdout.write(needed ? "true\n" : "false\n");
}
