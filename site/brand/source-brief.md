# Source, the brief

source.riffpress.com is Riff's documentation. It follows riffpress.com's brief (`riffpress-com/docs/brand-brief.md`) and takes its tokens (`site/tokens.css`) byte for byte; this page covers only what is Source's own. Impeccable's Read mode governs it: the visitor came to understand something, so the page is a document first, the frame is precise and quiet, and the column is calm.

Nobody was available to answer Impeccable's shape interview for this page, so every **assumption** below is marked as one.

## Who arrives, and what they came for

Four kinds of reader arrive. Each comes in by a door named for what they want to do, not by a type of page:

| Door | Who | Arrives from | Wants to |
| --- | --- | --- | --- |
| **Use Riff** | Someone who runs a WordPress site with music on it | riffpress.com, a search, the plugin's own notices | Get an album playing, then do one more thing with it |
| **Build on Riff** | A developer extending Riff or reading its data | A hook name or function in a search, GitHub | Find one signature, one route or one property fast, and trust it |
| **Run Riff for others** | A host, an agency or a multisite network | riffpress.com's Cloud pages, a release | Know how Riff behaves across sites, check a release, move a site |
| **Contribute** | Someone fixing or testing Riff | GitHub | Know how Riff is held together and what a change must keep |

**Assumption:** most readers come in deep, on a reference page or a lesson from a search, not on the home. So the frame has to say where a page is at a glance, and search has to be one key away.

## Outcome

- A reader can tell where they are and where to go next in one look, at 1440 and at 390.
- A developer reaches any hook, function, route or property from any page in two keystrokes and a name.
- Body text reads at 65 to 75 characters to the line, AA or better, in the shared type.
- Nothing appears twice on a page: each destination has one place.

## The direction

- **The world is riffpress.com's paper**, in its type, its hairlines and its ember. The frame takes the world: the bar, the sidebar, the rail, the way code and tables are set. The column does not.
- **The structure is a standard docs layout.** The bar is Riff | Source, then search, then Download. Below it are three columns divided by hairlines: the door's pages, the article, and "On this page".
- **The home is the four doors**, a typographic list with no cards. Each door is a title, one line on who it is for, and its first pages.
- **A door page** lists the door's pages, each with one line on what it covers. It is the only place those lines appear; the sidebar carries titles alone.
- **The sidebar shows the current door only.** A small switcher at its top names the door and changes it.
- **The signature move is precision:** a hairline grid and exact type for code, parameters and tables. There is nothing ornamental.

## Scope

**In scope:**
- The docs home, the door pages, every reference and lesson page, Download, the guide (Add your music) and the 404.
- The bar, the sidebar, the rail, search and the footer.

**Untouched:**
- riffpress.com and Cloud.
- The player's own design.
- The share cards (`og-images.js`).
- The words of the lessons and the reference, which change only where the owner asked for cuts.

**Anti-goals:**
- Cards, eyebrows, section numbers, gradients, glass, side-stripe callouts, glyph icons and hard shadows.
- Monospace as decoration.
- A second way to reach the same page on the same screen.
- Overview essays that restate the sidebar.

## Content and states

- **Ranges:** a page runs from one paragraph (a short hook page) to about 12,000 words (How the player works). There are 38 hooks, 20 JavaScript members, 14 REST routes and 28 CSS properties. Built on the open web covers 43 features, which become one page with a section each.
- **States:**
  - Search: empty, results, no result and no script. Without a script there is nothing to press, so search stays hidden; the Hooks index keeps its own filter.
  - The sidebar: on a door page, on a page in a door, on a page a door does not list (a hook, under PHP), and as a drawer on a phone.
  - The rail: an article with fewer than two sections shows no rail.
- **Decided after the wireframes:**
  - **Export** stays out of Run Riff for others until #958's import side is finished; the door shows only the pages that exist.
  - **Track schema** is a page of its own under Reference.
  - **The two real-device checklists** stay in the repository: their numbering runs across sections so a check can be recorded by number, which the handbook pages would renumber.

## Layout and interaction

- **Hierarchy:** the page's title, then its lede, then its sections. Garamond carries titles and Schibsted Grotesk everything else. Each step on the scale is at least 1.25 times the one below.
- **Wide (1200px and up):**
  - Sidebar, article and rail, with one gutter between each.
  - The bar is held at the top, and the sidebar and the rail stick under it.
  - A page with no sidebar starts its title where the docs start theirs.
- **Medium (900 to 1199px):** the rail folds into an "On this page" disclosure under the title.
- **Phone (under 900px):**
  - The bar holds the wordmark, search and Download.
  - A bar under it, held at the top, names the door and the page ("Use Riff / An album") and opens the door's pages as a sheet.
  - The rail is a disclosure.
  - Code runs edge to edge.
- **Search:**
  - It is a field in the bar, opened by ⌘K, Ctrl+K or /, and its results are a dialog over the page.
  - Its index is a JSON of each page's title, door, summary and headings, which developers-site.js writes at build time: 29 KB, 8 KB gzipped.
  - The keyboard moves through the results, and Escape closes it and returns focus.
- **Depth:** three layers, as the tokens define them. The page is flat. The phone's sheet and the search overlay use `--elevation-overlay`. Nothing else is raised.

## Constraints and open decisions

- **Constraints:**
  - Static pages from the generators in `.github/scripts/`, with no framework.
  - `site-nav.json` stays the one definition of the navigation.
  - Everything works without the script, except search's overlay and the phone's sheet, which fall back to a link and a plain list.
- **Decided: the shared type, and so no IBM Plex Mono.** Source takes riffpress.com's `--mono` (the platform's own monospace) for code. Code blocks are set at 14px on a 24px line, one step over `--text-mono`, because code is read at length here.
- **Settled:** Download lives in the bar alone, and each door page keeps its one-line descriptions.
