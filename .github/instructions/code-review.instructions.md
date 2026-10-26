---
applyTo: "**"
excludeAgent: "coding-agent"
---

# Reviewing a Riff pull request

What Copilot, or a person, should look for when reviewing a pull request.

## What counts as broken

- The player stops, skips, loses its place or plays the wrong track.
- A listener on a keyboard, a screen reader or a phone can no longer do something they could before.
- A site's data is lost or changed: the Media Library, a playlist, a like, a setting.
- A public surface changes under a site that depends on it: a hook, filter, REST route or argument, `window.riff` member or documented CSS custom property renamed or removed.
- A logged-out listener sees or does something only a signed-in one should, anywhere in `plugins/riff-sign-in/` or a REST route.
- The docs say something the code doesn't do.

## Riff's rules

A change that breaks one of these is a finding, with the rule named:

- No build step. Each plugin under `plugins/` ships as committed, with no bundler and no compiled files.
- Movement uses `transform` and `opacity`. A new transition or animation on a size or position (`width`, `height`, `padding`, `margin`, `top`, `left`) is a finding; a colour fading on hover is not.
- Every browser feature sits behind a check, so an older browser gets the plain version.
- State (hover, current, selected, pressed) never changes `font-weight`; it changes colour, opacity, an underline or a background, because a weight change shifts the layout.
- Icons are solid Material icons, never outlined ones.
- WordPress first: new storage, a field, a relation or a query needs a reason in [docs/native.md](../../docs/native.md), and WordPress's own version if it has one.
- New public surface is a promise kept forever once Riff is on WordPress.org. Ask whether a real extension needs it; Riff Lyrics, built only on the public API, is the test. Private is the default.

## What to leave out

- Style, naming and formatting: PHPCS, ESLint, stylelint and the spell check cover them.
- Code the pull request didn't touch, unless the change makes it wrong. Mark anything older as pre-existing.
- Generated files: `docs/hooks.md`, `docs/javascript.md`, `site/developers/`, `site/web/`, `site/sitemap.xml`, each `CHANGELOG.md` and each `readme.txt` changelog. Review the source they are built from; CI checks they match it.
- `vendor/`, `node_modules/`, `artifacts/`, `packages/fixtures/` media and `tests/`.
- `blueprint.json` naming its zip and demo files relative to itself (`riff.zip`, `demo/…`), and `site/index.html`'s `{{pages_url}}`. The Pages and preview workflows resolve them; they are not broken URLs.
- `packages/fixtures/*/cover-*.png` missing: they are WordPress's generated sizes, and gitignored.
- `tests/` being gitignored: on some machines it holds a personal music library.

## How to report

Name the file and line of each finding, and say what goes wrong: the input or state, then the wrong result. Don't guess at a file you haven't opened. Group findings of one kind into one, so the author fixes them all at once. Start with the count, or say plainly that there are no issues.

After the third round on one pull request, review only what changed since the last one, don't repeat a finding already answered, and if the same kind of finding keeps coming back, say the approach may be wrong rather than reporting it again.
