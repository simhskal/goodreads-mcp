import { afterEach, describe, expect, it } from "vitest";
import { decryptCredential, encryptCredential } from "../src/crypto.js";

const originalKey = process.env.GOODREADS_CREDENTIAL_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.GOODREADS_CREDENTIAL_KEY;
  else process.env.GOODREADS_CREDENTIAL_KEY = originalKey;
});

describe("credential encryption", () => {
  it("round-trips without storing plaintext", () => {
    process.env.GOODREADS_CREDENTIAL_KEY = Buffer.alloc(32, 7).toString(
      "base64",
    );
    const encrypted = encryptCredential("private-rss-key");
    expect(encrypted).not.toContain("private-rss-key");
    expect(decryptCredential(encrypted)).toBe("private-rss-key");
  });

  it("rejects the wrong key", () => {
    process.env.GOODREADS_CREDENTIAL_KEY = Buffer.alloc(32, 7).toString(
      "base64",
    );
    const encrypted = encryptCredential("private-rss-key");
    process.env.GOODREADS_CREDENTIAL_KEY = Buffer.alloc(32, 8).toString(
      "base64",
    );
    expect(() => decryptCredential(encrypted)).toThrow();
  });
});
