# @organized-chaos/goodreads-mcp

## 0.2.1

### Patch Changes

- 241367f: Add `mcpName` so the official MCP Registry can verify the published npm package.
- 01a3071: Point guided setup at the hosted OAuth endpoint and stop writing RSS keys into client config for that host.
- 919247f: Harden outbound RSS and Open Library fetches with timeouts, response size caps, and host-restricted redirects. Return stable public errors to MCP clients, bound shelf, search, user ID, and CSV inputs, and write Claude setup config without placing the RSS key on the process command line.
- Updated dependencies [919247f]
  - @organized-chaos/goodreads-mcp-core@0.2.1

## 0.2.0

### Minor Changes

- 63f162a: Add a fact-only, Markdown-ready reading brief and ship the npm package README
  so readers can discover setup and first prompts directly from npm.

### Patch Changes

- b149b8a: Add npm package READMEs and update scoped installation examples.
- Updated dependencies [b149b8a]
- Updated dependencies [63f162a]
  - @organized-chaos/goodreads-mcp-core@0.2.0

## 0.1.1

### Patch Changes

- 8249556: Publish the scoped Goodreads MCP packages under the organized-chaos namespace.
- Updated dependencies [8249556]
  - @organized-chaos/goodreads-mcp-core@0.1.1
