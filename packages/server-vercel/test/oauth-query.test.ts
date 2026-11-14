import { describe, expect, it } from "vitest";
import { oauthQuery } from "../src/html.js";

describe("oauthQuery", () => {
  it("reads the signed query Better Auth puts on the login page", () => {
    const request = new Request(
      "https://books.example.com/sign-in?client_id=client-1&sig=abc",
    );
    expect(oauthQuery(request)).toBe("client_id=client-1&sig=abc");
  });

  it("keeps an explicit oauth_query parameter", () => {
    const request = new Request(
      "https://books.example.com/sign-in?oauth_query=client_id%3Dclient-1%26sig%3Dabc",
    );
    expect(oauthQuery(request)).toBe("client_id=client-1&sig=abc");
  });

  it("rejects a page with no query", () => {
    expect(() =>
      oauthQuery(new Request("https://books.example.com/sign-in")),
    ).toThrow(/missing or expired/);
  });
});
