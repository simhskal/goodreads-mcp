import { describe, expect, it } from "vitest";
import { restorePostgresArray } from "../src/postgres-text-arrays.js";

describe("restorePostgresArray", () => {
  it("turns Better Auth JSON array text into a Postgres array parameter", () => {
    expect(
      restorePostgresArray(
        '["openid","profile","offline_access","library:read"]',
      ),
    ).toEqual(["openid", "profile", "offline_access", "library:read"]);
    expect(restorePostgresArray("[]")).toEqual([]);
    expect(restorePostgresArray("[1,2]")).toEqual([1, 2]);
  });

  it("leaves ordinary values unchanged", () => {
    expect(restorePostgresArray("not json")).toBe("not json");
    expect(restorePostgresArray('{"name":"Ada"}')).toBe('{"name":"Ada"}');
    expect(restorePostgresArray('[{"name":"Ada"}]')).toBe('[{"name":"Ada"}]');
    expect(restorePostgresArray(["already", "an", "array"])).toEqual([
      "already",
      "an",
      "array",
    ]);
    expect(restorePostgresArray(null)).toBeNull();
  });
});
