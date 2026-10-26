# Agents

Notes for coding agents. [CONTRIBUTING.md](.github/CONTRIBUTING.md) covers setup, tests, and pull request conventions. [docs/player.md](docs/player.md) explains the front end; read it before changing anything under `plugins/riff/`.

## Pull request descriptions

`gh pr create --body` bypasses the template. Its one question: what would we miss by only reading the diff? Answer that in a sentence at the top. Leave out what the diff already shows. Then, only if it matters for this change, a line on what you could not test or what is most likely wrong. Keep the whole description to a few sentences: no headed sections or bullet lists, and no How to test unless it isn't obvious.

## AI disclosure

Every pull request ends with the template's "Use of AI tools" block, per the [WordPress AI Guidelines](https://make.wordpress.org/ai/handbook/ai-guidelines/), in the collapsed form WordPress's own feature plugins use, never as a heading:

```
<details>
<summary>Use of AI tools</summary>

AI assistance: Yes
Tool(s): the tool
Model(s): the exact model ID
Used for: how much of the change it wrote, and that a person reviewed it

</details>
```

Put the disclosure there and nowhere else. No `Co-Authored-By` or session trailers in commits; the squash commit message becomes the changelog.

## Branches

Branch every pull request from `main`, never from another open pull request's branch. Pull requests are squash-merged, so the commit a stacked branch sits on never reaches `main`, and the stacked pull request conflicts with the very change it was built on. When one change needs another, wait for it to merge, then branch.

## Before a commit

The Playwright suite runs from the pre-commit hook against the local wp-env site, and again in Actions on the pull request. Do not skip the hook for changes under `plugins/`. Docs and site changes may skip it with `RIFF_SKIP_E2E=1`.

## Before a pull request

Show the change working: the test, the build, a screenshot against the design. Don't run a code review locally; Copilot reviews every pull request on GitHub, following [.github/instructions/code-review.instructions.md](.github/instructions/code-review.instructions.md). Answer each of its comments with a fix or a reason. When it keeps flagging something that isn't wrong, add it to Not bugs below; when it misses something, add it to those instructions.

## Merging

A pull request may auto-merge (`gh pr merge --auto --squash`) once its work is done, except one that touches `.github/workflows/`, `.github/scripts/`, `release-please-config.json`, `scripts/sync-versions.sh`, `plugins/riff-sign-in/`, or adds public surface (the Public API label). Those, and release-please's release pull requests, wait for a person to merge them.

## Not bugs

- `blueprint.json` names its zip and demo files relative to itself (`riff.zip`, `demo/…`), which is not a valid Playground URL on its own. The Pages workflow resolves them against wherever Pages serves the repository and stamps each with the commit, and a pull request's preview resolves them against its own preview branch, so neither demo depends on a hostname written down anywhere. `site/index.html`'s `{{pages_url}}` is filled in the same way.
- `packages/fixtures/*/cover-*.png` are WordPress's generated sizes and are gitignored.
- `tests/` is ignored on purpose: on some machines a personal music library lives there. Never commit it, never screenshot it.

## WordPress first

The Media Library is where Riff's music lives. Before adding storage, a field, a relation or a query, check what WordPress already has. When Riff has to fill a gap, add it to [docs/native.md](docs/native.md) with the reason, and with the core ticket when there is one.
