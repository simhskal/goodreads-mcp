export function htmlPage(
  title: string,
  content: string,
  script = "",
  status = 200,
): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
    :root{color-scheme:light;--ink:#211b16;--muted:#6b6259;--paper:#f7f3eb;--accent:#382110;--line:#d7cec1;--error:#8b1e1e}
    *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 ui-serif,Georgia,serif}
    main{max-width:42rem;margin:0 auto;padding:clamp(2rem,8vw,6rem) 1.25rem}h1{font-size:clamp(2rem,7vw,4rem);line-height:1;letter-spacing:-.04em;margin:0 0 1.25rem}
    p{max-width:36rem}.card{border-top:2px solid var(--ink);padding-top:1.25rem;margin-top:2rem}label{display:block;font-weight:700;margin-top:1.2rem}
    input{display:block;width:100%;margin-top:.4rem;padding:.8rem;border:1px solid var(--line);background:#fff;color:var(--ink);font:inherit}
    button{margin-top:1.5rem;padding:.8rem 1.1rem;border:0;background:var(--accent);color:#fff;font:700 1rem/1 ui-sans-serif,system-ui;cursor:pointer}
    button:disabled{opacity:.55;cursor:wait}.note{color:var(--muted);font-size:.92rem}.error{color:var(--error);font-weight:700}.scope{font-family:ui-monospace,monospace}
    </style></head><body><main>${content}</main>${script ? `<script>${script}</script>` : ""}</body></html>`,
    {
      status,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    },
  );
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
}

export function oauthQuery(request: Request): string {
  const value = new URL(request.url).searchParams.get("oauth_query");
  if (!value) throw new Error("The OAuth request is missing or expired.");
  return value;
}

export function jsonForScript(value: string): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
