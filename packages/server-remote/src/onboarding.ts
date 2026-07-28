import { cleanRssKey, parseGoodreadsIdentity } from "./identity.js";
import { parseGoodreadsCsv } from "./csv.js";
import { LibraryRepository } from "./repository.js";
import type { Env } from "./types.js";

export const OnboardingHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "goodreads-mcp" });
    }
    if (url.pathname !== "/authorize") {
      return new Response("Not found", { status: 404 });
    }
    try {
      const oauthRequest = await env.OAUTH_PROVIDER.parseAuthRequest(request);
      const client = await env.OAUTH_PROVIDER.lookupClient(
        oauthRequest.clientId,
      );
      if (request.method === "GET") {
        return html(connectPage(client?.clientName ?? "your MCP client"));
      }
      if (request.method !== "POST")
        return new Response("Method not allowed", { status: 405 });

      const form = await request.formData();
      const identity = parseGoodreadsIdentity(
        String(form.get("profile") ?? ""),
      );
      const rssKey = cleanRssKey(String(form.get("rss_key") ?? ""));
      const accountId = `goodreads:${identity.userId}`;
      const repository = new LibraryRepository(env.DB);
      await repository.saveUser(
        accountId,
        identity.userId,
        identity.profileUrl,
        rssKey,
      );

      const csv = form.get("library");
      if (csv instanceof File && csv.size) {
        if (csv.size > 10_000_000)
          throw new Error("CSV exports must be no larger than 10 MB.");
        await repository.importBooks(
          accountId,
          parseGoodreadsCsv(await csv.text()),
        );
      }
      const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
        request: oauthRequest,
        userId: accountId,
        metadata: { label: identity.profileUrl },
        scope: oauthRequest.scope ?? ["library:read", "account:write"],
        props: { userId: accountId, goodreadsUserId: identity.userId },
      });
      return Response.redirect(redirectTo, 302);
    } catch (error) {
      return html(
        connectPage(
          "your MCP client",
          error instanceof Error ? error.message : "Could not connect.",
        ),
        400,
      );
    }
  },
};

function html(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}

function connectPage(client: string, error?: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width">
  <title>Connect Goodreads</title><style>
  body{font:16px system-ui;max-width:38rem;margin:4rem auto;padding:0 1.25rem;color:#24201b}
  label{display:block;font-weight:650;margin-top:1.2rem}input{box-sizing:border-box;width:100%;padding:.7rem;margin-top:.35rem}
  button{margin-top:1.5rem;padding:.75rem 1rem;background:#382110;color:white;border:0;border-radius:.25rem}
  .error{background:#fee;padding:.75rem}.note{color:#625b53;font-size:.9rem}</style></head><body>
  <h1>Connect your Goodreads library</h1>
  <p>Authorize ${escapeHtml(client)} using your profile and Goodreads RSS feed. Your password and cookies are never requested.</p>
  ${error ? `<p class="error">${escapeHtml(error)}</p>` : ""}
  <form method="post" enctype="multipart/form-data">
    <label>Profile URL or user ID<input name="profile" required placeholder="https://www.goodreads.com/user/show/12345"></label>
    <label>RSS key (optional)<input name="rss_key" autocomplete="off"></label>
    <p class="note">Find it at My Books → a shelf → RSS. CSV-only accounts are supported.</p>
    <label>Goodreads library CSV (optional)<input name="library" type="file" accept=".csv,text/csv"></label>
    <button type="submit">Connect Goodreads</button>
  </form></body></html>`;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
