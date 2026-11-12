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
});
