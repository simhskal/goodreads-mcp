# @organized-chaos/goodreads-mcp-core

## 0.2.1

### Patch Changes

- 919247f: Harden outbound RSS and Open Library fetches with timeouts, response size caps, and host-restricted redirects. Return stable public errors to MCP clients, bound shelf, search, user ID, and CSV inputs, and write Claude setup config without placing the RSS key on the process command line.

## 0.2.0

### Minor Changes

- 63f162a: Add a fact-only, Markdown-ready reading brief and ship the npm package README
  so readers can discover setup and first prompts directly from npm.

### Patch Changes

- b149b8a: Add npm package READMEs and update scoped installation examples.

## 0.1.1

### Patch Changes

- 8249556: Publish the scoped Goodreads MCP packages under the organized-chaos namespace.
