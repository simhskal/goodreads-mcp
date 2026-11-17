# Releasing npm packages

The publishable packages are:

- `@organized-chaos/goodreads-mcp-core`
- `@organized-chaos/goodreads-mcp`

Versions are managed by Changesets. Add a `.changeset/*.md` file to a change
PR. After that PR merges, the release workflow opens a version PR. Merging the
version PR runs the checks, packs both packages, rejects unsafe manifests, and
publishes the core package before the CLI package.

The workflow publishes packed artifacts with npm's OIDC trusted publishing. It
does not store an npm token in GitHub. Each package must have a trusted
publisher configured for `release.yml`, repository `simhskal/goodreads-mcp`,
and the `main` branch workflow. npm requires a package to exist before its
trusted publisher can be configured, so the first scoped release requires a
one-time authenticated bootstrap; subsequent releases are automatic.

The publish script skips versions that are already on npm, including a version
it published earlier in the same run before `npm view` can see it. After a
real publish it runs `changeset git-tag`, which writes `CHANGESETS_OUTPUT` so
the release workflow can push tags and open GitHub releases.

Local validation:

```sh
pnpm changeset status
pnpm release:verify
pnpm publish -r --dry-run --no-git-checks
```

Pull requests run those last two commands in the `release-preview` CI job
before a version PR can merge.

## MCP Registry

npm publish does not list the server in the official MCP Registry. The release
workflow's version step is `pnpm run version`: it runs `changeset version`,
then copies the `@organized-chaos/goodreads-mcp` version into `server.json`
(`version` and every `packages[].version`). Version PRs include that update.
`pnpm check` fails when the files differ. Run `mcp-publisher publish` only
after that version is on npm and its `package.json` contains `mcpName`. The
checklist is in
[CONTRIBUTING.md](CONTRIBUTING.md#list-the-server-in-directories).
