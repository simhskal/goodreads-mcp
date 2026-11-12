import { describe, expect, it } from "vitest";
import { authSecret } from "../src/config.js";

describe("auth secret", () => {
  it("requires a 32 character BETTER_AUTH_SECRET at startup", () => {
    expect(() => authSecret({})).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => authSecret({ BETTER_AUTH_SECRET: "short" })).toThrow(/32/);
    expect(authSecret({ BETTER_AUTH_SECRET: "x".repeat(32) })).toHaveLength(32);
  });
});
