import { describe, expect, it } from "vitest";
import { GET, signInErrorPage } from "../../../api/sign-in.js";

describe("sign-in errors", () => {
  it("escapes and stabilizes failures instead of interpolating raw errors", async () => {
    const html = await signInErrorPage(
      new Error(`<script>alert("x")</script>`),
    ).text();
    expect(html).toContain("Invalid request.");
    expect(html).not.toContain("<script>alert");

    const page = GET(new Request("https://goodreads.example/sign-in"));
    expect(page.status).toBe(400);
    const body = await page.text();
    expect(body).toContain(
      '<p class="error">The OAuth request is missing or expired.</p>',
    );
    expect(body).not.toContain("<script>");
  });

  it("posts the signed query with anonymous sign-in", async () => {
    const previous = {
      DATABASE_URL: process.env.DATABASE_URL,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      GOODREADS_CREDENTIAL_KEY: process.env.GOODREADS_CREDENTIAL_KEY,
    };
    process.env.DATABASE_URL = "postgres://reader:secret@localhost/postgres";
    process.env.BETTER_AUTH_SECRET = "x".repeat(32);
    process.env.BETTER_AUTH_URL = "https://books.example.com";
    process.env.GOODREADS_CREDENTIAL_KEY = "a".repeat(8);
    try {
      const page = GET(
        new Request(
          "https://books.example.com/sign-in?client_id=client-1&sig=abc",
        ),
      );
      expect(page.status).toBe(200);
      const html = await page.text();
      expect(html).toContain("body:JSON.stringify({oauth_query:q})");
      expect(html).toContain("client_id=client-1&sig=abc");
    } finally {
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });
});
