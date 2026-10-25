import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

export function encryptCredential(value: string): string {
  const key = credentialKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [VERSION, encode(iv), encode(tag), encode(encrypted)].join(".");
}

export function decryptCredential(value: string | null): string | undefined {
  if (!value) return undefined;
  const [version, ivValue, tagValue, encryptedValue] = value.split(".");
  if (version !== VERSION || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Stored Goodreads credential has an unsupported format.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    credentialKey(),
    decode(ivValue),
  );
  decipher.setAuthTag(decode(tagValue));
  return Buffer.concat([
    decipher.update(decode(encryptedValue)),
    decipher.final(),
  ]).toString("utf8");
}

function credentialKey(): Buffer {
  const encoded = process.env.GOODREADS_CREDENTIAL_KEY;
  if (!encoded) throw new Error("GOODREADS_CREDENTIAL_KEY is required.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error(
      "GOODREADS_CREDENTIAL_KEY must be 32 bytes encoded as base64.",
    );
  }
  return key;
}

function encode(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}
