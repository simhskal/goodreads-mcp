import { describe, expect, it } from "vitest";
import { cleanRssKey, parseGoodreadsIdentity } from "../src/identity.js";

describe("Goodreads identity", () => {
  it("normalizes a profile URL", () => {
    expect(
      parseGoodreadsIdentity(
        "https://www.goodreads.com/user/show/12345-reader",
      ),
    ).toEqual({
      userId: "12345",
      profileUrl: "https://www.goodreads.com/user/show/12345",
    });
  });

  it("accepts a numeric user id", () => {
    expect(parseGoodreadsIdentity(" 42 ").userId).toBe("42");
  });

  it("rejects unrelated hosts and malformed RSS keys", () => {
    expect(() =>
      parseGoodreadsIdentity("https://example.com/user/show/42"),
    ).toThrow();
    expect(() => cleanRssKey("bad key!")).toThrow();
  });
});
