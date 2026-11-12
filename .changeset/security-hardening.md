---
"@organized-chaos/goodreads-mcp-core": patch
"@organized-chaos/goodreads-mcp": patch
---

Harden outbound RSS and Open Library fetches with timeouts, response size caps, and host-restricted redirects. Return stable public errors to MCP clients, bound shelf, search, user ID, and CSV inputs, and write Claude setup config without placing the RSS key on the process command line.
