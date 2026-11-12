import { afterEach, describe, expect, it, vi } from "vitest";
import { errorResult } from "./result.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tool error results", () => {
  it("returns a stable public message for known failures", () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    expect(errorResult(new Error("Invalid shelf name."))).toEqual({
      isError: true,
      content: [
        { type: "text", text: "Goodreads request failed: Invalid shelf name." },
      ],
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it("hides internal errors and logs a redacted original", () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const result = errorResult(
      new Error(
        "DATABASE_URL is required. fetch https://www.goodreads.com/x?key=abc123-private",
      ),
    );
    expect(result.content).toEqual([
      { type: "text", text: "Goodreads request failed." },
    ]);
    const text = JSON.stringify(logged.mock.calls);
    expect(text).toContain("DATABASE_URL is required.");
    expect(text).not.toContain("abc123-private");
  });
});
