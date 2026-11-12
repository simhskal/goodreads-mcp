import { timingSafeEqual } from "node:crypto";

export function isCronAuthorized(
  header: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
