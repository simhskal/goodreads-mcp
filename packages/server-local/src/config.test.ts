import { describe, expect, it } from "vitest";
import { readConfig } from "./config.js";

describe("readConfig", () => {
  it("reads and trims the Goodreads identity", () => {
    expect(
      readConfig({
        GOODREADS_USER_ID: " 12345 ",
        GOODREADS_RSS_KEY: " secret ",
      }),
    ).toEqual({ userId: "12345", rssKey: "secret" });
  });

  it("allows a public feed without an RSS key", () => {
    expect(readConfig({ GOODREADS_USER_ID: "12345" })).toEqual({
      userId: "12345",
    });
  });

  it("requires a numeric Goodreads user ID", () => {
    expect(() => readConfig({})).toThrow("GOODREADS_USER_ID is required");
    expect(() => readConfig({ GOODREADS_USER_ID: "user-name" })).toThrow(
      "must contain only digits",
    );
  });
});
