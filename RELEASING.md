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

Local validation:

```sh
pnpm changeset status
pnpm release:verify
```
