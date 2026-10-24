# Agents

Notes for coding agents. [CONTRIBUTING.md](.github/CONTRIBUTING.md) covers setup, tests, and pull request conventions. [docs/player.md](docs/player.md) explains the front end; read it before changing anything under `plugins/riff/`.

## Pull request descriptions

`gh pr create --body` bypasses the template. Its one question: what would we miss by only reading the diff? Answer that in a sentence at the top. Leave out what the diff already shows. Then, only if it matters for this change, a line on what you could not test or what is most likely wrong. Keep the whole description to a few sentences: no headed sections or bullet lists, and no How to test unless it isn't obvious.

## AI disclosure

Every pull request includes the template's "Use of AI tools" section with the tool, the model, and how much of the change it wrote, per the [WordPress AI Guidelines](https://make.wordpress.org/ai/handbook/ai-guidelines/). Put the disclosure there and nowhere else. No `Co-Authored-By` or session trailers in commits; the squash commit message becomes the changelog.

## Before a commit

The Playwright suite runs from the pre-commit hook against the local wp-env site, and again in Actions on the pull request. Do not skip the hook for changes under `plugins/`. Docs and site changes may skip it with `RIFF_SKIP_E2E=1`.

## Not bugs

- `blueprint.json` names its zip and demo files relative to itself (`riff.zip`, `demo/…`), which is not a valid Playground URL on its own. The Pages workflow resolves them against wherever Pages serves the repository and stamps each with the commit, and a pull request's preview resolves them against its own preview branch, so neither demo depends on a hostname written down anywhere. `site/index.html`'s `{{pages_url}}` is filled in the same way.
- `packages/fixtures/*/cover-*.png` are WordPress's generated sizes and are gitignored.
- `tests/` is ignored on purpose: on some machines a personal music library lives there. Never commit it, never screenshot it.

## WordPress first

The Media Library is where Riff's music lives. Before adding storage, a field, a relation or a query, check what WordPress already has. When Riff has to fill a gap, add it to [docs/native.md](docs/native.md) with the reason, and with the core ticket when there is one.
