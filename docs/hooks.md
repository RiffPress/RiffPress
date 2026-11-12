# Hooks

Every filter and action Riff fires, generated from the docblocks in the plugin by `npm run docs:hooks`. Do not edit by hand. The stability promise is in .github/SUPPORT.md: a hook listed here keeps its name and parameters within a major version, and goes through a deprecated release before it is removed.

The same reference, a page per hook, is on the site under Developers, PHP and JavaScript.

## Filters

### `riff_abilities`

Filters the abilities Riff registers, so an extension adds its own the way Riff adds its: each the REST route it runs, with what it takes and what it answers. Each is registered in Riff's category, run as a REST request to its route and allowed what the route's own permission callback allows, and offered to an MCP client only where the site turns that on.

Each is keyed by its name, a namespace of the plugin's own, a slash and a name, such as `riff-lyrics/set-lyrics`, and has a `label` and a `description`; the route's `method`, its `namespace` (`riff/v1` unless given) and its `route`, with each part the input fills in braces, such as `/media/{id}`; the `input`'s properties as JSON Schema, each with `required` where it must be given; the `output` as JSON Schema; and `readonly`. It may also have `params`, a callable that takes the input left after the route's parts and gives the route's parameters, and `destructive` (default false) and `idempotent` (default true).

Since 6.5.0. Fires in `plugins/riff/src/class-abilities.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$abilities` | `array[]` | Abilities by name: Riff's own, and any added before. |

### `riff_about_sections`

Filters the sections of the About panel, Riff's own included: `track`, the cover, the title and the artist and album, and `credits`, what the file's tags say about who made it.

Each section is drawn into the panel, hidden, as `[data-riff-about="<id>"]`, with its heading and an empty `.riff-about-body`. Its script fills the body and shows the section on the `riff.view` action, when its `id` is `about`; a section with nothing to say for the track playing stays hidden.

Since 5.9.0. Fires in `plugins/riff/src/class-about.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$sections` | `array[]` | By id (lowercase letters, digits and dashes), each with a `label`, its heading, or empty for none; an `order`, lowest first; and an optional `render`, a callable given the id that returns the body's markup as the page is drawn. |

### `riff_add_music_url`

Filters where the Listen app sends someone who may upload to add music: the account menu's Add music, and Add your first album in an empty library.

The slug of one of the app's views (riff_app_views) leads to that view, inside the app. At the default address the app opens its own file picker in place of following the link, and uploads what is chosen to the Media Library; at any other address the link is followed, and the empty library no longer names the Media Library.

Since 6.4.0. Fires in `plugins/riff/features/listen/class-browse.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$url` | `string` | The address, or a view's slug. Default admin_url( 'media-new.php' ). |

### `riff_app_at_root`

Filters whether the site's own address opens the Listen page's app. On, a request for the home page with no other query is the Listen page in standalone mode, every link to the app and the manifest's start address are the home page, and the app/ address redirects there. The Listen page's own address and the theme's front page setting are left as they are.

A host that gives each site its own player turns it on with `add_filter( 'riff_app_at_root', '__return_true' )`.

Since 6.4.0. Fires in `plugins/riff/features/listen/class-standalone.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$on` | `bool` | Whether it is on, from Settings › Riff. Default false. |

### `riff_app_manifest`

Filters the Listen app's web app manifest, for a host that names, colours or gives icons to each site's app its own way.

The document's theme-color meta tag follows the manifest's theme_color. Its page colours come from the custom properties on `.riff-standalone`, such as `--riff-standalone-bg`.

Since 6.4.0. Fires in `plugins/riff/features/listen/class-standalone.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$manifest` | `array` | The manifest's members: id, name, short_name, description, start_url, scope, display_override, display, background_color, theme_color and icons. |

### `riff_app_precache`

Filters what the installed Listen app's service worker keeps on the device, so it is there offline and on every launch after the first: a host's fonts that the first paint doesn't show, say. The fonts `riff_app_preload_fonts` returns are already in it.

Only these addresses are answered from the device; every other request goes to the network as before. An address on another host needs CORS. Return an empty array for no service worker at all.

Since 6.6.0. Fires in `plugins/riff/features/listen/class-fonts.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$urls` | `string[]` | Addresses: the first paint's fonts, then Riff's stylesheets and its script modules. |

### `riff_app_preload_fonts`

Filters the fonts a Listen page preloads, the faces its first paint shows, so a host that draws the app in fonts of its own has them fetched with the page rather than after the stylesheet asks. The installed app's service worker keeps them on the device too.

Each is preloaded with `crossorigin`, as a font must be, so an address on another host needs CORS. Name each exactly as the stylesheet's `url()` does, or the browser fetches it twice.

Since 6.6.0. Fires in `plugins/riff/features/listen/class-fonts.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$urls` | `string[]` | Font addresses: Roboto in the app at app/, Inter and EB Garamond in the Listen block where the theme sets no font. |

### `riff_app_views`

Filters the Listen app's views: Riff's own, by slug (`home`, `search`, `albums`, `artists`, `tracks`, `posts` and `library`), and any a plugin adds.

A plugin adds a view under a slug of its own, lowercase letters, digits and dashes, with a `label` and a `render` callback, and Riff serves it at the app's address with `?riff_view=<slug>`, the Listen page's own or, where the site opens the app at its address, the site's. Riff draws the view's title and the panel around what `render` returns, and once the view shows, on arrival or after in-page navigation, fires the `riff.app_view` action and the `riff:app_view` event on `document`, for the plugin's script to bind to what it drew.

A view of a plugin's is an array with a `label`, its name in the navigation; `title`, its heading, the label by default; `icon`, one of Riff's icons by name or SVG markup from the plugin's own code; `nav`, where it is listed, `sidebar` (beside Albums, Artists and Tracks, a chip on a phone) and or `account` (the account menu), sidebar by default; `capability`, what a visitor needs to see it at all, none by default; `render`, given the app's address and returning the panel's HTML, escaped by the plugin; and `script`, `style` and `module`, handles of the plugin's registered scripts, styles and script modules, which Riff enqueues on the page that holds the app.

Unsetting `albums`, `artists`, `tracks` or `posts` takes it out of the app: out of the navigation, out of Home's rows, and its address opens Home. Home, Search and Library stay.

Since 6.4.0. Fires in `plugins/riff/features/listen/class-views.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$views` | `array` | The views by slug, Riff's own first. |

### `riff_can_play`

Filters whether the current visitor may play a track.

A membership or store plugin returns false for a track its rules keep from this visitor. The track is then listed as locked rather than hidden, with no file to play.

Since 4.17.0. Fires in `plugins/riff/src/class-tracks.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$allowed` | `bool` | Whether the track plays. Default true. |
| `$track` | `array` | Track, after riff_track. |
| `$attachment_id` | `int` | Attachment ID, or 0 for a file outside the Media Library. |
| `$post_id` | `int` | The post the track appears in, or 0. |

### `riff_client_navigation`

Filters whether a link on the site is followed without leaving the page, so what plays carries on. Only a block theme can: its template is the region that is swapped.

A host turns it on for every site with `add_filter( 'riff_client_navigation', '__return_true' )`.

Since 6.2.0. Fires in `plugins/riff/src/class-navigation.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$on` | `bool` | Whether it is on, from Settings › Riff. Default false. |

### `riff_cover_accent`

Filters whether the player takes its accent from the cover of the track playing: the cover's hue, muted and lightened until it reads on the player's dark surfaces, as `--riff-cover-accent`, on the seek bar, the playing bars, the current Up next item and a wash behind Now Playing, and in the Listen app's own document on its links, the track playing, Liked songs and the Browse tiles. A cover that is grey, near black or near white gives none, and the accent is the site's `--riff-accent`, as it is everywhere with this off.

A host keeps its one accent everywhere with `add_filter( 'riff_cover_accent', '__return_false' )`.

Since 6.5.0. Fires in `plugins/riff/src/class-player.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$on` | `bool` | Default true. |

### `riff_enabled`

Filters whether Riff's player loads on the current front-end request.

Since 4.0.0. Fires in `plugins/riff/src/class-player.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$enabled` | `bool` | Whether to load the player. |

### `riff_extensions`

Filters the extensions Riff loads, by name: a host can leave one out, or name another plugin it has placed in Riff's extensions/ folder.

Since 5.8.0. Fires in `plugins/riff/src/class-extensions.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$names` | `string[]` | The names in extensions.json. |

### `riff_import_private`

Filters whether a zip uploaded to the Media Library imports privately: each track and video Protected, each album's post private, for its uploader to publish. A host whose privacy is site-wide, such as a private site, can return false so that what the site already keeps from visitors is not hidden a second time, album by album: return `! Private_Site::on()`. It answers for the import in the background, which an upload to the Media Library and POST /riff/v1/imports both start; `wp riff import` takes --private and --no-private. Defaults to true.

Since 6.8.0. Fires in `plugins/riff/src/class-import.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$private` | `bool` | Whether the import is private. |
| `$id` | `int` | The zip's attachment ID. |
| `$author` | `int` | The ID of the user who uploaded it, whom the import runs as. |

### `riff_mcp`

Filters whether AI assistants may use Riff's abilities over MCP. On, and with the MCP Adapter plugin active, `/wp-json/mcp/riff` serves each of them as a tool to a signed-in user, and the adapter's default server lists them. Each still does only what that user may do. Off, there is no such server, and the default server does not list them.

A host that offers it on every site turns it on with `add_filter( 'riff_mcp', '__return_true' )`.

Since 6.5.0. Fires in `plugins/riff/src/class-mcp.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$on` | `bool` | Whether it is on, from Settings › Riff. Default false. |

### `riff_post_blocks`

Filters whether a post's blocks are served as a tree at riff/v1/posts/{id}/blocks to someone who cannot edit the post.

The tree is the post's own markup, before any block renders, so a plugin that hides part of a post as it renders, a members-only block, say, is not asked. Turn it on where nothing on the site does that. Someone who may edit the post always gets its blocks, as they get its raw content from wp/v2, and a post that is not published, or is behind a password, is never served to anyone else.

Since 6.5.0. Fires in `plugins/riff/src/class-blocks-rest.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$on` | `bool` | Whether to serve them. Default false. |
| `$post` | `WP_Post` | The post asked for. |

### `riff_profile_url`

Filters where the Listen app's account menu sends a listener to edit their profile, for a host or a membership plugin with a profile page of its own. An empty string hides Edit profile, for a host with no profile page.

Since 6.4.0. Fires in `plugins/riff/features/listen/class-browse.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$url` | `string` | The address, or '' to leave Edit profile out of the menu. Default get_edit_profile_url(), their profile in wp-admin. |
| `$user` | `\\WP_User` | The signed-in listener. |

### `riff_protect_storage`

Filters whether the storage a file is kept in elsewhere was made private, when it is protected, or public again, when it isn't. A plugin that keeps uploads in object storage or on a CDN answers for its own files: true once the copy there is private (or public again), or a WP_Error to say why it couldn't be, which the Media Library shows. Without an answer, a file only on this server is moved into the protected folder, and one kept elsewhere is not protected, as moving it would leave it public there. Riff can't send a file it doesn't have, so a plugin that protects its files signs their addresses through riff_protected_url too.

Since 5.7.0. Fires in `plugins/riff/src/class-protected-files.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$done` | `true\|WP_Error\|null` | Null, the default: nothing keeps it elsewhere. |
| `$id` | `int` | Attachment ID. |
| `$protect` | `bool` | True to make it private, false to make it public again. |

### `riff_protected_path`

Filters the folder protected files are kept in, so the web server never has them to send: an absolute path outside the web root, which Riff makes when it is first needed, keeping each site's files in a folder of its own inside it (the site's ID on a network). Empty, the default, keeps them in a folder under uploads, which Apache is told to refuse and Nginx needs a rule for.

A path inside ABSPATH, wp-content, uploads, or the folder that holds both WordPress and wp-content, is refused with a notice, and the files stay under uploads; WP Engine's _wpeprivate folder at the site's root, which WP Engine never serves, is the one exception. When the path changes, Riff moves the files already protected to the new folder in the background, or at once with `wp riff protected move`. Defaults to the RIFF_PROTECTED_PATH constant.

Since 6.5.0. Fires in `plugins/riff/src/class-protected-files.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$path` | `string` | Absolute path, or empty for the folder under uploads. |

### `riff_protected_send`

Filters how a protected file is handed over: 'php' sends it from PHP; 'x-sendfile' asks Apache's mod_xsendfile or LiteSpeed to send it; 'x-accel-redirect' asks Nginx, which then needs an internal location for the protected folder (see the readme).

X-Sendfile names the file's absolute path, wherever it is kept, so with RIFF_PROTECTED_PATH the web server must be allowed that folder (XSendFilePath on Apache). X-Accel-Redirect names the file's address under uploads, or, with RIFF_PROTECTED_PATH, its path inside that folder under /riff-protected/, which an internal location aliases to it; a file in neither, as one not yet moved into the folder it belongs in is, is sent from PHP instead.

Since 4.18.0. Fires in `plugins/riff/src/class-protect.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$how` | `string` | 'php', 'x-sendfile' or 'x-accel-redirect'. Default 'php'. |
| `$file` | `string` | Absolute path. |
| `$id` | `int` | Attachment ID. |

### `riff_protected_url`

Filters the address a protected file is sent from instead of WordPress: a signed address on a CDN or in object storage, such as a CloudFront or S3 presigned URL or a Bunny or Cloudflare token, that stops working at $expires. Riff has checked that the visitor may have the file before it asks, and sends them on with a 302 nothing caches. Empty, the default, sends the file as riff_protected_send says.

Since 5.7.0. Fires in `plugins/riff/src/class-protect.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$url` | `string` | Signed address, or empty. |
| `$id` | `int` | Attachment ID. |
| `$expires` | `int` | When the address should stop working, as a Unix time: an hour on. |

### `riff_sources`

Filters the sources tracks are read from, keyed by id.

Since 4.0.0. Fires in `plugins/riff/src/class-sources.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$sources` | `Source[]` | Sources. |

### `riff_together_share`

Filters whether a listener who hasn't chosen shares what they play with the site's other listeners. A site where listeners shouldn't see each other unless they ask, a class of children say, returns false.

Since 5.8.0. Fires in `plugins/riff/features/listen/class-together.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$share` | `bool` | Whether they share. Default true. |
| `$user_id` | `int` | The listener. |

### `riff_track`

Filters a track before the player reads it.

Since 4.0.0. Fires in `plugins/riff/src/class-tracks.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$track` | `array` | Track: id, src, type, title, artist, album, duration, art, video, post. |
| `$attachment_id` | `int` | Attachment ID, or 0 for a file outside the Media Library. |
| `$post_id` | `int` | The post the track appears in, or 0. |

### `riff_turntable`

Filters whether Now Playing shows the record and the turntable. Off, it shows the cover on its own, and a touch screen on its side shows the cover beside the controls.

Since 5.8.0. Fires in `plugins/riff/src/class-turntable.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$on` | `bool` | Whether it shows, from Settings › Media. Default true. |

### `riff_unlock_url`

Filters where a locked track sends the visitor to unlock it: a sign-up, membership or checkout page.

Since 4.17.0. Fires in `plugins/riff/src/class-tracks.php`.

| Parameter | Type | Description |
| --- | --- | --- |
| `$url` | `string` | Address, or empty for none. Default empty. |
| `$track` | `array` | Track. |
| `$attachment_id` | `int` | Attachment ID, or 0. |
| `$post_id` | `int` | The post the track appears in, or 0. |

## Actions

### `riff_before_player`

Fires before the player's markup.

Since 4.0.0. Fires in `plugins/riff/src/class-player.php`.

### `riff_below_turntable`

Fires in the place under the turntable, for what a plugin shows beside the record. Print one element for each thing: the place takes room only while one that isn't hidden is in it, and only where the turntable is the view. The record is out when `#riff` has `data-riff-deck="out"`. Script it from there; `window.riff.analyser()` hears the music.

Since 6.3.0. Fires in `plugins/riff/templates/player.php`.

### `riff_private_refused`

Fires before a private site refuses a visitor, for a page of the site's own in place of WordPress's message.

Since 6.3.0. Fires in `plugins/riff/src/class-private-site.php`.

### `riff_register`

Fires once a request, before the player's controls and views are first read: register them here with `riff_register_control()` and `riff_register_view()`, or take one of Riff's own away. A plugin's keyboard shortcuts are registered here too, with `riff_register_shortcut()`.

Since 5.8.0. Fires in `plugins/riff/src/class-registry.php`.

## JavaScript

The player fires these through `wp.hooks` when the page has it. Each action is also dispatched as a `riff:<name>` `CustomEvent` on `#riff` with the same detail, for pages without the WordPress scripts.

### JavaScript filters

#### `riff.menu`

Filters the items of the track menu, the … beside every row and every track in Up next.

Return the items with yours added where they belong: the menu shows them in the order given. Riff's own are, in order, `next` (Play next), `add` (Add to queue), `like`, `playlist`, then in Up next `up`, `down` and `remove`, then `post` (Go to post), each only where it applies, with what Riff's own features add, such as Listen along, among them; find one by its `id` rather than its place. An item with neither `run` nor `href`, or with no `label`, is left out.

Since 5.9.0. Fires in `plugins/riff/assets/player/menu.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `items` | `Object[]` | The items, each `{ id, label, run, href }`: `id` names it, `label` is what the listener reads, `run()` is called when it is picked, after the menu closes, and `href`, in place of `run`, makes it a link. |
| `track` | `Object` | The track the menu is for, in the shape `Tracks::schema()` describes. |
| `context` | `Object` | Where the menu was opened. |
| `context.where` | `string` | `row`, a row on the page, or `queue`, a track in Up next. |
| `context.index` | `number` | For Up next, the track's place in the queue, from 0. |

#### `riff.queue`

Filters the tracks about to become the queue.

Return a new array to add, drop or reorder tracks before any of them plays.

Since 4.0.0. Fires in `plugins/riff/assets/player/queue.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `tracks` | `Object[]` | The tracks, in the shape `Tracks::schema()` describes. |
| `index` | `number` | The position in `tracks` that will play first. |

#### `riff.shortcuts`

Filters whether the single-key shortcuts (Space, K, J, L and plugins' keys) act on a key press.

Return `false` to turn them off, which WCAG 2.1.4 asks to be possible. It turns off the keys plugins register with `riff_register_shortcut()` too.

Since 4.0.1. Fires in `plugins/riff/assets/player/keyboard.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `enabled` | `boolean` | Whether the shortcuts act. Default true. |
| `event` | `KeyboardEvent` | The key press. |

#### `riff.track`

Filters one track as a queue is set, after `riff.queue`.

Since 4.0.0. Fires in `plugins/riff/assets/player/queue.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `track` | `Object` | The track, in the shape `Tracks::schema()` describes. |

### JavaScript actions

#### `riff.app_view`

Fires when a view of the Listen app shows: the first as the app starts, then each one in-page navigation brings, and again when one is drawn again in place. A plugin that added a view with the `riff_app_views` filter binds its script to what it drew here, or on the `riff:app_view` event, which bubbles to `document`.

Since 6.4.0. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | The view. |
| `detail.view` | `string` | Its slug: `home`, `albums`, `album`, `post` and the rest of Riff's, or the plugin's own. |
| `detail.panel` | `HTMLElement` | The element the view is drawn in, `[data-riff-app-view]`; a plugin's is inside it, `[data-riff-app-panel="<slug>"]`. |
| `api` | `Object` | `window.riff`. |

#### `riff.ended`

Fires when a track plays to its end, before the next one loads.

Since 4.0.0. Fires in `plugins/riff/assets/player/media.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.track` | `Object` | The track that ended. |
| `api` | `Object` | `window.riff`. |

#### `riff.pause`

Fires when the track pauses.

Since 4.0.0. Fires in `plugins/riff/assets/player/media.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.track` | `Object` | The track. |
| `api` | `Object` | `window.riff`. |

#### `riff.play`

Fires when the track starts or resumes playing.

Since 4.0.0. Fires in `plugins/riff/assets/player/media.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.track` | `Object` | The track. |
| `api` | `Object` | `window.riff`. |

#### `riff.queue`

Fires when the queue changes while it plays: tracks added to play next or at the end, one moved or removed, or the queue cleared.

Since 4.19.0. Fires in `plugins/riff/assets/player/queue.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.change` | `string` | `next`, `add`, `move`, `remove` or `clear`. |
| `detail.queue` | `Object[]` | The queue in play order. |
| `detail.index` | `number` | The playing track's place in it. |
| `api` | `Object` | `window.riff`. |

#### `riff.ready`

Fires once the player is set up, its state restored and `window.riff` available.

Since 4.0.0. Fires in `plugins/riff/assets/riff.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | The player's state. |
| `detail.queue` | `Object[]` | The queue in play order. |
| `detail.track` | `Object\|null` | The track loaded, or null. |
| `api` | `Object` | `window.riff`. |

#### `riff.time`

Fires as the track plays, a few times a second, and again after a seek.

Since 4.32.0. Fires in `plugins/riff/assets/player/media.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | Where the track is. |
| `detail.track` | `Object` | The track. |
| `detail.time` | `number` | Seconds from its start. |
| `detail.duration` | `number` | Its length in seconds, or 0 until known. |
| `api` | `Object` | `window.riff`. |

#### `riff.track`

Fires when a track is loaded, before it plays.

Since 4.0.0. Fires in `plugins/riff/assets/player/playback.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.track` | `Object` | The track now loaded. |
| `detail.index` | `number` | Its position in the play order. |
| `detail.queue` | `Object[]` | The queue in play order. |
| `api` | `Object` | `window.riff`. |

#### `riff.view`

Fires when a view opens or closes, Riff's own included, and again for an open view when the track changes. A view's script fills it here, or in the `render` it was given.

Since 5.8.0. Fires in `plugins/riff/assets/player/registry.js`.

| Parameter | Type | Description |
| --- | --- | --- |
| `detail` | `Object` | What changed. |
| `detail.id` | `string` | The view's id. |
| `detail.open` | `boolean` | Whether it is open now. |
| `detail.view` | `HTMLElement` | Its region: `[data-riff-view="<id>"]` for a screen of its own, `[data-riff-panel="<id>"]` for a panel and for a sidebar view, docked or not, and Now Playing itself for the album. |
| `detail.track` | `Object\|null` | The track playing. |
| `api` | `Object` | `window.riff`. |

