# Goodreads MCP — Open-Source Plan

## Reality check (research findings, July 2026)

**The official Goodreads API is dead.** No new keys since Dec 2020; even long-lived keys now return 403s (Dec 2025 reports). Goodreads has **no OAuth** — there is nothing at Goodreads to "log in" to programmatically.

**Consequence:** the "OAuth to login once" the user experiences is between the MCP client (Claude Code / Codex) and _our_ server. During that one-time login, we collect the user's Goodreads identity (profile URL / user ID + RSS key) and bind it to their account on our server. Goodreads data then flows through sanctioned channels:

| Channel                                                              | What it gives                                                | Limits                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Per-shelf RSS feeds (`/review/list_rss/{user_id}?key=...&shelf=...`) | Live shelf data: title, author, ISBN, ratings, dates, covers | ~100 most recent items per shelf; needs per-user RSS key for private-ish data    |
| CSV export (manual, My Books → Export Library)                       | Complete library incl. reviews                               | Human-in-the-loop; good for one-time full import                                 |
| Internal AppSync GraphQL / scraping                                  | Everything                                                   | Unofficial, ToS-violating, anti-bot-fragile — **kept out of the hosted service** |

Alternative worth noting: **Hardcover** has a real free GraphQL API and imports Goodreads libraries — a possible v2 backend or sister integration.

## Client compatibility constraints (drives the architecture)

- The hosted endpoint uses Streamable HTTP because both Claude Code and Codex support it.
- The endpoint is stateless: clients send the Goodreads user ID and optional RSS key as HTTPS headers on each request.
- Full-history CSV access stays local so library exports are not uploaded or persisted by the hosted service.

## Recommended architecture

**Local stdio server + stateless Vercel Streamable HTTP endpoint, TypeScript.**

- The local package provides the complete feature set, including optional CSV imports.
- The Vercel endpoint reuses the same tool registration and RSS-backed data layer.
- **No Goodreads passwords, session cookies, scraping, or hosted credential storage.**

### MCP tools (v1)

- `list_shelves` — shelves discovered from RSS/CSV
- `get_reading_list(shelf, limit)` — books with title/author/ISBN/rating/dates
- `get_currently_reading` / `get_recently_read`
- `reading_stats(year?)` — counts, avg rating, pace (CSV-backed when available)
- `search_library(query)` — search the user's own books
- `get_book(isbn|title)` — metadata enriched via Open Library (real, free API)

## Milestones

1. **v0 — core library + local stdio server (1st week).** Data layer (RSS parser, CSV importer, types) as a standalone package; thin stdio server reading `GOODREADS_USER_ID`/`GOODREADS_RSS_KEY` from env. Validates tools end-to-end in both CLIs with zero hosting. Ships as `npx goodreads-mcp`.
2. **v1 — stateless hosted server.** Vercel Streamable HTTP endpoint using client-supplied headers, with no server-side credential or library storage. Verify from both Claude Code and a current Codex build.
3. **v1.1 — onboarding + polish.** Guided local setup, `reading_stats`, response caching, and a clear privacy explanation.
4. **Open-source launch.** MIT license; README with copy-paste setup for both clients; Vercel self-host button; GitHub Actions CI (typecheck, tests, build); SECURITY.md + privacy note; submit to the official MCP registry, PulseMCP, and Smithery.

## Risks & mitigations

- **RSS 100-item/shelf cap** → CSV import for history; document per-year shelf convention (`read-2025`) as a workaround.
- **Goodreads kills RSS** → data layer is pluggable; Hardcover GraphQL is the documented migration target (it imports Goodreads libraries).
- **Private profiles** → RSS key covers the owner's own feed; document that fully-private profiles may need CSV-only mode.
- **Credential exposure** → keep hosted requests stateless, use HTTPS headers, and never persist or log the RSS key.
- **ToS exposure** → hosted path is RSS only; any scraping/GraphQL experiments stay out entirely.

## Market launch sequence

The launch is about the outcome—making a reader's history useful to their AI—not
about MCP configuration. Do not schedule a Product Hunt launch until the
published package, demo, and self-serve setup path below are live.

1. **Release foundation.** Merge the setup simplification, publish
   `@organized-chaos/goodreads-mcp-core` and `goodreads-mcp` to npm, tag a GitHub release, and
   validate `npx -y goodreads-mcp` from a clean temporary directory. Publish
   public metadata to the official MCP Registry once the install method is live.
2. **Conversion surface.** Rework the landing page around a concrete AI result,
   a 45–60 second demo, a Codex/Claude/local client chooser, exact copyable
   configuration, and a compact privacy promise. Add canonical, Open Graph, and
   X metadata plus privacy-preserving attribution and setup-success events.
3. **Private beta.** Ask 10–20 MCP users who actively use Goodreads to set it
   up unaided. Record only consented, non-secret failure points and fix the
   largest source of abandonment before launch.
4. **Launch assets.** Prepare a square Product Hunt icon, 2–4 gallery images,
   demo video, product description, maker first comment, X post/thread, and
   LinkedIn post. Use outcome-led language: "Make your reading history usable
   by your AI."
5. **Launch day.** Post from a personal Product Hunt maker account, then
   announce on X and LinkedIn. Be present for comments, help users through
   setup without requesting credentials, and turn recurring feedback into
   GitHub issues.
6. **Week one.** Review activation (page visit → install → successful first
   tool call), user questions, and referral sources. Decide whether the next
   product investment is easier credential/setup onboarding or richer reading
   recommendations.

## Repo structure (proposed)

```
goodreads-mcp/
  packages/
    core/          # RSS parser, CSV importer, types, stats
    server-local/  # stdio server (npx goodreads-mcp)
  README.md        # setup for Claude Code + Codex, self-host button
  LICENSE          # MIT
  SECURITY.md
  .github/workflows/ci.yml
```
