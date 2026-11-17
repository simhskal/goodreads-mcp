import { describe, expect, it } from "vitest";
import {
  createReleaseRegistry,
  outputSaysAlreadyPublished,
} from "../../../scripts/publish-packages.mjs";

describe("npm release registry", () => {
  it("trusts a version this run already published when the registry lags", () => {
    const lookups: string[] = [];
    const registry = createReleaseRegistry({
      lookup(name: string, version: string) {
        lookups.push(`${name}@${version}`);
        return false;
      },
    });

    registry.remember("@organized-chaos/goodreads-mcp-core", "0.2.1");

    expect(
      registry.isPublished("@organized-chaos/goodreads-mcp-core", "0.2.1"),
    ).toBe(true);
    expect(lookups).toEqual([]);
  });

  it("asks the registry for a version this run has not published", () => {
    const registry = createReleaseRegistry({
      lookup() {
        return false;
      },
    });

    expect(
      registry.isPublished("@organized-chaos/goodreads-mcp-core", "0.2.1"),
    ).toBe(false);
  });

  it("recognizes npm's already-published conflict", () => {
    expect(
      outputSaysAlreadyPublished(
        "npm error 403 You cannot publish over the previously published versions: 0.2.1.",
      ),
    ).toBe(true);
    expect(
      outputSaysAlreadyPublished(
        "npm error 403 Forbidden - two-factor authentication is required",
      ),
    ).toBe(false);
  });
});
