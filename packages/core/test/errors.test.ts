import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clientFacingMessage,
  logInternalError,
  safeClientMessage,
} from "../src/errors.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("client-facing errors", () => {
  it("keeps stable validation messages and hides internal ones", () => {
    expect(safeClientMessage(new Error("Invalid shelf name."))).toBe(
      "Invalid shelf name.",
    );
    expect(
      safeClientMessage(new Error("Goodreads RSS returned HTTP 404.")),
    ).toBe("Goodreads RSS returned HTTP 404.");
    expect(
      safeClientMessage(new Error("DATABASE_URL is required.")),
    ).toBeUndefined();
    expect(
      clientFacingMessage(
        new Error("DATABASE_URL is required."),
        "Could not connect Goodreads.",
      ),
    ).toBe("Could not connect Goodreads.");
    expect(
      clientFacingMessage(
        new Error("The RSS key contains unexpected characters."),
        "Could not connect Goodreads.",
      ),
    ).toBe("The RSS key contains unexpected characters.");
  });

  it("redacts RSS keys before logging the original error", () => {
    const error = new Error(
      "connect failed https://www.goodreads.com/review/list_rss/1?key=abc123-private",
    );
    error.cause = new Error("key=abc123-private");
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    logInternalError(error);
    const text = JSON.stringify(logged.mock.calls);
    expect(text).not.toContain("abc123-private");
    expect(text).toContain("redacted");
  });
});
