# Contributing

Goodreads MCP is a pnpm workspace requiring Node.js 20 or newer.

```sh
pnpm install
pnpm check
pnpm build
```

Keep the hosted service on documented data channels: Goodreads RSS,
user-provided CSV exports, and public metadata services. Changes that add
password collection, session-cookie collection, private API calls, or scraping
will not be accepted.

Add tests for parsing and query behavior. Never commit real RSS keys or library
exports; fixtures must use invented data.

## List the server in directories

`server.json` at the repository root is the official MCP Registry entry. Its
`name`, `io.github.chaosorganized/goodreads-mcp`, must match `mcpName` in
`packages/server-local/package.json`. The registry reads that field from the
public npm tarball, so the field has to be in a published version. Schema:
[server.schema.json (2025-12-11)](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json).
Publishing steps:
[MCP Registry quickstart](https://modelcontextprotocol.io/registry/quickstart).

`0.2.0` was published before `mcpName` existed. Do not submit that version.

1. Merge the Changesets version PR so npm publishes
   `@organized-chaos/goodreads-mcp` with `mcpName`. In that same PR, set
   `version` and `packages[0].version` in `server.json` to the new package
   version. `pnpm check` fails when they differ.
2. Install `mcp-publisher` and sign in with a GitHub account that belongs to
   the `chaosorganized` organization: `mcp-publisher login github`. That login
   can publish the `io.github.chaosorganized/*` namespace
   ([authentication](https://modelcontextprotocol.io/registry/authentication)).
3. From the repository root, after that npm version is live, run
   `mcp-publisher publish`.
4. Confirm the listing:

   ```sh
   curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.chaosorganized/goodreads-mcp"
   ```

The npm package is the local stdio server (`npx -y @organized-chaos/goodreads-mcp`).
The `remotes` entry is the hosted Streamable HTTP endpoint
`https://goodreads-mcp-chi.vercel.app/oauth/mcp`.

### Smithery

Smithery lists a server that is already deployed.

1. Open [smithery.ai/new](https://smithery.ai/new).
2. Submit `https://goodreads-mcp-chi.vercel.app/oauth/mcp`.
3. Skip connection settings. Readers sign in with OAuth, so the listing does
   not ask for an API key.
4. If the scan stops at the OAuth wall, serve a static server card at
   `/.well-known/mcp/server-card.json` and publish again. See
   [Smithery's publish guide](https://smithery.mintlify.dev/docs/build/publish).

[PulseMCP submissions are paused](https://www.pulsemcp.com/submit). PulseMCP
asks publishers to use the official registry and says it will ingest that
listing when its form reopens.
