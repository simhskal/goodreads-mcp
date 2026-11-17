import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { finishRelease } from "../../../scripts/publish-packages.mjs";
import { releasePreviewNeeded } from "../../../scripts/release-preview-needed.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("changeset release output", () => {
  it("records git tags only after a real publish", () => {
    const calls: string[] = [];
    finishRelease({
      dryRun: true,
      tag() {
        calls.push("dry-run");
      },
    });
    finishRelease({
      dryRun: false,
      tag() {
        calls.push("git-tag");
      },
    });

    expect(calls).toEqual(["git-tag"]);
  });
});

describe("release preview gate", () => {
  it("runs for the version branch and for version or registry edits", () => {
    expect(
      releasePreviewNeeded({
        headRef: "changeset-release/main",
        changedPaths: ["README.md"],
      }),
    ).toBe(true);
    expect(
      releasePreviewNeeded({
        headRef: "feature",
        changedPaths: ["packages/server-local/package.json"],
      }),
    ).toBe(true);
    expect(
      releasePreviewNeeded({
        headRef: "feature",
        changedPaths: ["server.json"],
      }),
    ).toBe(true);
    expect(
      releasePreviewNeeded({
        headRef: "feature",
        changedPaths: ["packages/server-local/src/server.ts"],
      }),
    ).toBe(false);
  });

  it("wires the pull request job to the verify and dry-run commands", () => {
    const workflow = readFileSync(
      resolve(repoRoot, ".github/workflows/ci.yml"),
      "utf8",
    );

    expect(workflow).toContain("pnpm release:verify");
    expect(workflow).toContain("pnpm publish -r --dry-run --no-git-checks");
    expect(workflow).toContain("scripts/release-preview-needed.mjs");
  });
});
