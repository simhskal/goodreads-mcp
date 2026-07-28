# Remote server

This package deploys the Streamable HTTP MCP server and OAuth 2.1 provider to
Cloudflare Workers.

## Cloudflare resources

Create the resources, then replace the placeholder IDs in `wrangler.jsonc`:

```sh
wrangler d1 create goodreads-mcp
wrangler kv namespace create OAUTH_KV
wrangler kv namespace create OAUTH_KV --preview
wrangler kv namespace create CACHE
wrangler kv namespace create CACHE --preview
pnpm db:migrate
```

`OAUTH_KV` stores OAuth clients and grants. `CACHE` stores Goodreads RSS
responses for up to 15 minutes. `DB` stores the account's Goodreads identity
and imported library.

No Goodreads passwords or session cookies are accepted. The worker does not
need a Goodreads application key.

## Run and deploy

```sh
pnpm dev
pnpm typecheck
pnpm test
pnpm deploy
```

The server exposes:

- `/mcp` — authenticated Streamable HTTP MCP
- `/authorize` — Goodreads identity and optional CSV onboarding
- `/oauth/register` — dynamic client registration
- `/oauth/token` — token and refresh exchange
- `/health` — unauthenticated health check
- `/.well-known/oauth-protected-resource` — protected-resource metadata

Use `delete_account` from an authenticated MCP session to remove the stored
profile and books. Revoke the server connection in the client afterward to
discard its tokens.
