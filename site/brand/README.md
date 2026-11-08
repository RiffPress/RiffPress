# Riff's brand

**The wordmark** is the word *Riff*: *Ri* in EB Garamond Italic at weight 800, and its *ff* as a score writes *fortissimo*, music's marking for very loud. The *ff* is Bravura's (the SMuFL reference font for music notation), scaled so its *f*s rise to Garamond's ascender, and set close so its tails sweep under the *i*. In a score, dynamics sit beside a text face, so the pair is how music is printed. Every file is outlines, so nothing depends on either font being installed.

**The main mark** is the word in ink on a light ground: on paper in the header of every page on source.riffpress.com, where the word leads back to riffpress.com and *Source* beside it to the docs, and in the RiffPress organisation's picture (`avatar-ink.png`) and the social preview. **The app icon** is the same word on its charcoal tile, for the player: the installed app, the plugin's icon and the favicon, which uses the tile cropped to its edge so it fills a small square. Those are the two; there is no other mark.

**Proportions** follow the golden ratio, φ. On the app icon, the word's margins either side are 1/φ⁵ of the tile.

**Colour** is ink on paper, with one accent: ember, a muted fire colour at about 1900K. Neither the paper nor the greys is pure: each neutral leans a hair toward ember's hue, at OKLCH hue 55 to 70 with chroma under 0.01, so the page is warm without being cream. These are riffpress.com's values, by the same names, so the two sites are one system; on Source they live in `site/web/web.css`'s `:root`, and matching riffpress.com's `site/tokens.css` is a change to that one block.

| Token | OKLCH | What it is for |
| --- | --- | --- |
| `--white` | `oklch(0.992 0.002 70)` | The page |
| `--white-2` | `oklch(0.968 0.004 65)` | Code, the current link in the sidebar, hover |
| `--rule` | `oklch(0.89 0.006 60)` | Hairlines: the grid's dividers, a table's rows |
| `--rule-strong` | `oklch(0.8 0.008 58)` | A table's head, the divider in Riff \| Source |
| `--field-edge` | `oklch(0.56 0.01 55)` | A field's edge, 4.6:1 |
| `--ink` | `oklch(0.18 0.008 55)` | Text, the one button, the ink wordmark, 18.4:1 |
| `--ink-3` | `oklch(0.3 0.009 55)` | A page's lede, 13.4:1 |
| `--ink-2` | `oklch(0.45 0.01 55)` | Quieter text, 7.3:1 on white and 6.8:1 on white-2 |
| `--ember-deep` | `oklch(0.5 0.12 48)` | Links, the focus ring, where you are: the sidebar's current page, the header's current section, the section being read; 6.2:1 |
| `--ember-ink` | `oklch(0.42 0.11 46)` | A link under the pointer |
| `--ember` | `oklch(0.72 0.13 55)` | Ember on night: riffpress.com's and the player's, listed here for the reconciliation; Source has no night surface and does not use it |
| `--wash` | `oklch(0.91 0.045 60)` | Selected words, under ink 14.3:1 |

The one primary button on a page is ink with paper on it. There is no blue, no gold and no gradient: the rest of the colour comes from the player, in its pictures and its covers.

**Type** is three families, each self-hosted from `../fonts/`, subset to Latin, and under the SIL Open Font License 1.1:

- **EB Garamond** (`eb-garamond.woff2`, variable 400 to 800) for titles: a page's title at 36 to 52px and its sections at 32px, weight 500.
- **Schibsted Grotesk** (`schibsted-grotesk.woff2`, variable 400 to 900), riffpress.com's text face, for everything read or pressed: running text at 17px on a 28px line, about 70 characters to the line, and the sidebar, tables and fine print at 15px and 13px. It replaces Inter on Source, which is left in `../fonts/` only for the share cards that `og-images.js` draws.
- **IBM Plex Mono** (`ibm-plex-mono.woff2`, 400 and 600) for code, parameters and hook names, at 14px on a 24px line in a block and 0.875em in a sentence.

Each has a fallback sized to its metrics (`size-adjust` and the ascent and descent overrides in `web.css`), so the swap when the font arrives moves nothing.

**The grid** on Source is three columns, the sidebar (15rem), the article (42rem) and "On this page" (13rem), with the same 64px between them, under a 64px bar, divided by hairlines that are one device pixel on a dense screen. A page with no sidebar starts its title where the docs start theirs. Space steps by 8px, with 4px and 12px for what sits close, as on riffpress.com.

| File | What it is |
| --- | --- |
| `wordmark.svg` | *Riff*, in amber, on a transparent ground |
| `wordmark-ivory.svg` | *Riff* in Riff's ivory, `#f2eadb`, on a transparent ground, for use on a dark background |
| `wordmark-ink.svg`, `wordmark-ink.png` | The main mark: *Riff* in charcoal ink on a transparent ground, for the paper, in the header of every source.riffpress.com page; the PNG 2048px wide |
| `avatar-ink.png` | The ink word on Riff's paper, `#fcfaf6`, 1024px square, with 1/φ⁵ margins: the GitHub organisation's picture |
| `social-preview.png` | 1280×640, the word, "A music player for WordPress" and the five strings on the paper: the repository's social preview, in Settings › General |
| `../icons/favicon.svg` | The app icon cropped to its tile, for the favicon |
| `mark.png` | The app icon's tile, 512px, for the README and the site |
| `avatar.png` | The GitHub organisation's old picture, the *ff* alone |
| `dots.svg` | wordpress.org's dots, between sections |
| `icon.svg` | The app icon, on Apple's icon grid |

EB Garamond is © 2017 The EB Garamond Project Authors, and Bravura © Steinberg Media Technologies GmbH. Both are under the SIL Open Font License 1.1 (`../fonts/eb-garamond-OFL.txt`, `bravura-OFL.txt`), which covers outlines drawn from them for a logo.
