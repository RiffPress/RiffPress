# UI surfaces

Every place a plugin can put something a listener sees or presses, how each is registered, and a plan for making them one small system. Riff's own features are listed beside the plugins in this repository (Riff Lyrics, Riff Sing, Riff Chords, Riff Chimera, Riff Sign In), since the rule is that Riff registers its own the way anyone's plugin would. Paths are under `plugins/`. The references are [hooks.md](hooks.md) and [javascript.md](javascript.md); the player's own explanation is [player.md](player.md#registering-controls-and-views).

This is written as if the pull request that moves Riff Chimera back to `place: 'side'` has landed: after it, the Listen app's sidebar dock has no built-in user.

## What there is today

### The surfaces, and who uses them

| Surface | PHP | JavaScript | Registered | Users |
| --- | --- | --- | --- | --- |
| A view, `place: 'screen'`: a screen of Now Playing | `riff_register_view()`, `riff_unregister_view()` on `riff_register` (`riff/src/functions.php`, `riff/src/class-registry.php`) | `window.riff.view( id, { render, shown, … } )` (`riff/assets/player/registry.js`) | Both: the server draws it, the script fills it; a script alone may add one | Album (`album`, the stage, 26), Lyrics (30), Sing (32), Chords (34) |
| A view, `place: 'side'`: a panel beside the page | The same | The same | Both | About (36), Up next (40), Together (45, signed in), Chimera (34) |
| A view, `place: 'sidebar'`: docked in the Listen app's sidebar | The same | The same | Both | None |
| A view's chip in Now Playing (phone) | None: `Registry::chips()` draws one for every view | None | Derived from the view | Every view; Share is Riff's own, hard-coded (`Player::chips()`) |
| A control in the bar | `riff_register_control()`, `riff_unregister_control()` on `riff_register` | `window.riff.control( id, { run, pressed, label, shown, action, element } )` | Both | Like (10), the badges (20), Play on another device (60), the volume (70); no plugin |
| A keyboard shortcut | `riff_register_shortcut()` (key and label, listed on the profile) | `window.riff.shortcut( id, run )` (`riff/assets/player/keyboard.js`) | Both, and both are needed: a key the server didn't register does nothing | Chords (A, S, F, D, U) |
| About's sections | `riff_about_sections` filter (`riff/src/class-about.php`) | Fill `[data-riff-about="<id>"]` on the `riff.view` action for `about` | Server, filled by a script | Riff's `track` and `credits`; no plugin |
| The track menu (…) | None | `riff.menu` filter through `wp.hooks` (`riff/assets/player/menu.js`) | Client | Chords (Practice this), Together (Listen along); the Listen app's playlists through the internal `listen( 'menu' )` |
| The space under the turntable | `riff_below_turntable` action (`riff/templates/player.php`) | Script it from there | Server | None in this repository |
| A Listen app view, with its link in the nav | `riff_app_views` filter, `nav: [ 'sidebar' ]` (`riff/features/listen/class-views.php`, `Browse::nav()`) | `riff.app_view` action, `riff:app_view` event | Server, bound by a script | Riff's own (Home, Search, Albums, Artists, Tracks, Posts, Library); no plugin |
| The account menu | `riff_app_views` with `nav: [ 'account' ]`; `riff_profile_url`, `riff_add_music_url` (`Browse::account()`) | None | Server | No plugin; a host changes the two links |
| The sidebar's heading (the site's name) | None: `Browse::nav()` draws it | None | Hard-coded | Riff |
| Home's shelves, the app's top strip | None (`class-home-view.php`, `app/frame.js`, which says it is not an extension point) | None | Hard-coded | Riff |
| The badges beside the track | None | Internal only: `listen( 'badges' )` | Client, internal | Riff's own quality badges |
| Blocks | WordPress's block API; the Listen block (`riff/features/listen/block/block.json`) | WordPress's | WordPress | Riff |
| Loading a script beside the player | `riff_before_player` action, or a view's or control's `script` argument | None | Server | Every extension uses `riff_before_player`; none uses `script` |

### How each behaves

| Surface | Order | Per track | Persists | Phone | Tabs frame, embedded player | Accessibility |
| --- | --- | --- | --- | --- | --- | --- |
| Screen | `order`, then registration order (`Registry::sorted()`) | `shown( track )`: button and chip hide; open, it goes back to the screen before it | Nothing | Chip in Now Playing; the bar button only on a wide screen (`wide` defaults to true for a view) | Same everywhere the player is | A `section` with `aria-label`, focusable; "%s closed" is spoken when it gives way |
| Panel (`side`) | The same | The same; open, it closes | `riff:panel` in `localStorage`: the last one, reopened on the next page on a wide screen | A sheet: `role="dialog"`, `aria-modal`, everything else `inert`, Tab kept inside, Escape closes | Beside the page, or a sheet, as `--riff-side-place` says | Heading takes focus as it opens; focus returns to what opened it |
| Docked (`sidebar`) | The same, as rows of the dock | The same; its row hides | `riff:dock`: every id left open | A panel | A panel: only standalone mode's sidebar has the dock (`--riff-dock`) | A disclosure: an `h2` with a button, `aria-expanded`, a `region` |
| Control | `order`, interleaved with the views' buttons | `shown( track )`, `pressed( track )`, `label( track )` | Nothing | Only if `wide` is false (its default for a control) | Same | A button with `aria-label`; `aria-pressed` when `pressed` is given |
| Shortcut | None; one key each, first come first served | Acts only while a track is loaded | The listener's own on/off, on their profile | Not applicable | Same | Off for visitors and when turned off (WCAG 2.1.4); listed on the profile |
| About section | `order`, then registration order | The script shows or hides it | Nothing | Inside About | Same | A heading per section, when it has a label |
| Track menu item | The array's order; find Riff's by `id` | The filter decides per track | Nothing | Same | Same | A menu item with the label |
| App view | Riff's first, then the filter's order; Library last | Not applicable | The address (`?riff_view=`) | A chip in the top row | Same in the app; not in the embedded player | A link with `aria-current`; the view has its title as a heading |

Documentation, types and checks:

| Surface | Documented | Typed (`packages/types`) | `extension-surface.test.js` |
| --- | --- | --- | --- |
| Views, controls, shortcuts (JS) | [javascript.md](javascript.md), [player.md](player.md#registering-controls-and-views) | `RiffApi.view`, `.control`, `.shortcut`; `place` is `string`, not the three places | The `window.riff` members an extension uses |
| Views, controls, shortcuts (PHP) | Docblocks in `functions.php` and `class-registry.php`; the PHP reference | None for the argument arrays | Now: every `riff_*()` an extension calls is one of Riff's functions |
| `riff_about_sections`, `riff_app_views`, `riff_below_turntable` | [hooks.md](hooks.md) | `AppView` and `AppViewDefinition` only | Every `riff_*` hook an extension adds |
| `riff.menu` | [hooks.md](hooks.md#riffmenu) | `RiffFilters[ 'riff.menu' ]`, its items as `Record<string, unknown>` | Now: every `riff.*` hook an extension adds through `wp.hooks` |

## How it holds together

### Vocabulary

A newcomer can't predict the API from its words. "View" means two different things: a player view (`riff_register_view()`, a screen or a panel) and a Listen app view (`riff_app_views`, a page of the app). "Panel" is the player's name for a `side` view, while the app calls the element a view is drawn in `panel` (`riff.app_view`'s `detail.panel`). The `place` values name different kinds of thing: `screen` is what it is, `side` is where it is, and `sidebar` names the app's sidebar, where the view is only sometimes, being a panel everywhere else. "Dock" appears only in the code and CSS (`Registry::dock()`, `--riff-dock`), never in the API. A control's `wide` defaults to false and a view's to true, under the same name.

### Two ways to register, and three shapes

The player's surfaces are registered with functions on an action (`riff_register_view()`), About's sections and the app's views with filters over an array (`riff_about_sections`, `riff_app_views`), and the track menu with a JavaScript filter. Each is reasonable alone; together a plugin author has to learn three shapes for what is, to them, "add a thing here". The PHP and JS halves of a view repeat `label`, `icon` and `order`, which the browser accepts only for a view the server didn't draw; for one it did, the server's win silently.

### Gaps

- **The sidebar's heading.** `Browse::nav()` draws the site's name and the collapse button with no hook. A host that wants a switcher between a listener's Riffs (the network asked for one, as `riff_app_switcher`) has nowhere to put it.
- **Nav items.** A plugin can only add a link to the app's nav by adding a whole app view, with a `render`. There is no plain link, and no way to add to Your Library's section.
- **The right panel holds one thing.** One panel shows at a time (`registry.js`, `show()`). About opens by default on a wide screen, so any other panel replaces it. Chimera, Lyrics, Chords and Sing all want room beside the music, and only Chimera has it.
- **A control can't show state beyond pressed.** No badge, count or "something new" dot; `label( track )` is the only way to say more, and only to a screen reader.
- **Menus.** The track menu has a public filter; the album menu, the account menu (except through an app view) and the bar's overflow have none.
- **Chips.** A plugin gets a chip only for a view; it can't add an action chip beside Share.
- **Settings.** No surface: an extension adds its own settings page, and Settings › Riff only turns extensions on and off.
- **Isolation.** `class-permissions.php` describes `riff_register_view` and `riff_register_shortcut` to a site owner but not `riff_register_control`, the `control` member, or `riff_unregister_*`; an extension that adds a bar control is shown to the site owner only by the function's name, under "Uses these parts of Riff".

### Ordering

Orders are plain integers shared by every plugin, with Riff's own documented. Two collide today: Chords and Chimera are both 34, so which comes first is decided by which plugin WordPress loads first. Nothing warns of a collision, and the documented list in player.md is the only registry of who has which number.

### Lifecycle

Every JavaScript registration returns a function that takes it away, and the PHP side has `riff_unregister_*`, so removal is covered. A plugin's failure is not contained: `fill()` calls a view's `render()` and `fits()` calls its `shown()` with no `try`, inside the `riff:track` handler that settles the open panel, then each docked view, then the screen. One plugin's view that throws stops every view after it from being filled for the new track, and a `shown()` that throws stops `draw()` from updating the rest of the bar.

### Performance

Every view's and control's markup is drawn on every page with the player, hidden until opened, and every extension's script loads with it on `riff_before_player`. The `script` argument would let Riff enqueue a module only for the surface that needs it, but nothing uses it, and Riff enqueues it on every page anyway. `shown()` runs for every control and view on every `draw()`, which happens on each press and each track change: cheap today, as nobody's `shown()` does much.

### Riff on its own API

The player's surfaces pass: the album, About, Up next, Together and the bar's controls are registered with `Registry` on `riff_register` exactly as a plugin's are. Two exceptions show where the public API is short. About and Together are filled by Riff's own imports on the `riff:view` event (`riff/assets/riff.js`), not through `window.riff.view()`. The Listen app's playlists add to the track menu through the internal `listen( 'menu' )`, and the badges use the internal `listen( 'badges' )`, neither public.

## What it should be

### Six surfaces, one shape

Each surface is registered once, on the server, with a function on `riff_register` that takes an id and an array (`label`, `icon`, `order`, and what that surface needs), and is given behaviour in the browser by the same id. Filters stay for changing what is there, never as the way in.

| I want to add | Use |
| --- | --- |
| Something that takes over Now Playing (words, a chart, a visual) | A view, `place: 'screen'` |
| Something that sits beside the music while the listener keeps browsing | A view, `place: 'panel'` (today `side`), a tab of the right panel |
| Something that belongs to the app rather than the track (a switcher, a status) | The sidebar's slots: its heading, or the dock |
| A button in the bar | A control, with `badge( track )` for a count or a dot |
| A key | A shortcut |
| An item in a menu | A menu item: `riff.menu` today, and the same filter for the album and account menus |
| A page of the app, with its link | An app view (`riff_app_views`), or a plain nav link once there is one |
| A part of About | An About section |

### The right panel

**Recommendation: tabs.** The right panel stays one region, with a tab for each `side` view that has something for the track (`shown()`), About first and open by default on a wide screen. Opening another view selects its tab instead of replacing the panel's content without a trace, so About is one press away. With one view there is no tab strip. A stack of sections was the other choice: it fits About's sections already, but stacked Lyrics, Chords and Chimera would each be too short to use. One at a time, as now, keeps nothing visible once a plugin's view opens. The tabs follow the ARIA tabs pattern: a `tablist`, arrow keys between tabs, each view its `tabpanel`, and on a phone the sheet keeps the same tabs at its top.

### The left dock

**Recommendation: keep `sidebar` as a place, for the app's own things, and stop offering it to track views.** A track view docked under the nav covers the library on a short window and duplicates the right panel. The dock suits what is about the listener or the site rather than the track: a switcher, Together's room, an upload's progress. Its rows stay as they are; the registration is unchanged, and the documentation steers track views to the panel.

### Moving there without breaking anyone

- `place` gains `panel` as the name for `side` and `dock` for `sidebar`. The old values keep working; `_doing_it_wrong()` is not called for them.
- The two `wide` defaults, false for a control and true for a view, are documented side by side, not changed.
- New arguments (`badge`, a tab's `order` in the panel) are optional; a plugin that passes none sees no change.
- Nothing is removed within a major version, per the promise in [SUPPORT.md](../.github/SUPPORT.md).

### Phased plan

Each phase is one small pull request.

1. Contain failures: wrap a view's `render()` and `shown()` and a control's `shown()`, `pressed()` and `label()` in `try`, report to the console, and carry on. A Playwright test with a view that throws.
2. Types: tighten the `@param` for `view.place` to `'screen'|'side'|'sidebar'` and type a menu item, in `riff/assets/riff.js`, so `packages/types` follows; add Chimera to that docblock's list of views; a PHPUnit test for ties in `Registry::sorted()`.
3. Isolation: describe `riff_register_control`, `control`, and `riff_unregister_*` in `class-permissions.php`.
4. The sidebar's heading: an action or filter around the site's name in `Browse::nav()`, documented and tested, for the switcher.
5. The right panel as tabs, About first.
6. A control's `badge( track )`.
7. The `panel` and `dock` names for `place`, with the old ones kept.
8. Load an extension's script only with its surface: make `script` the documented way and have Riff's extensions use it.
9. Menus: the album menu through the same filter as the track menu, with `context.where` saying which.

## Decisions for Joe

| Decision | Recommendation |
| --- | --- |
| The right panel: one at a time, tabs, or a stack | Tabs, About first and open by default; no strip with one view |
| The left dock's role | Keep the place for the app's own things (the switcher, Together's room); steer track views to the panel |
| The sidebar's heading: a filter on the markup, or an action inside it | An action inside the heading, after the name, so the name and collapse button stay Riff's and a host only adds |
| New names for `place` | `panel` and `dock`, with `side` and `sidebar` kept as they are |
| A control's state beyond pressed | `badge( track )`, returning a short string or nothing, said to a screen reader with the label |
| Settled orders | Keep integers, and give each extension in this repository its own number in player.md |
| Lazy scripts | Make `script` the documented way to load, and move the extensions to it |
