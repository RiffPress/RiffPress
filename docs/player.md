# How the player works

What Riff does on the front end, for anyone changing `plugins/riff/`. The README has the short version.

## Blocks become one queue

- The server marks each core audio and video block with its track, as a data attribute on the
  figure, and each item of a playlist block (WordPress 7.1) with its own. It leaves the block's
  markup alone, so a page still plays if the script never runs.
- A playlist's own player is not started, since it fetches the whole current file to draw its
  waveform. The page's player plays the playlist's tracks instead.
- The script turns those blocks into rows and plays them through one queue: the post's media is
  the queue, and the row you tap is where it starts.
- One `<audio>` and one `<video>` element serve the whole page. A track with a video version plays
  through whichever is showing, and switching hands the position across.
- A phone pauses video when the page goes to the background, so the track moves to audio while
  hidden and back when it returns.

## What else it does

The rest is what a player should do:

- Media Session gives the lock screen its metadata and controls.
- AirPlay and Cast appear when a device is in reach.
- A swipe on the bar skips, and a drag on Now Playing closes it.
- A script can slow the music down or speed it up with `window.riff.speed()`, as Riff Chords'
  practice controls do. The pitch is kept (`preservesPitch`), the speed holds from track to track,
  and on the turntable it is multiplied by the deck's own; while it is not 1 the platter starts and
  stops at once rather than winding, since winding would bend the pitch.
- On the turntable, tapping the sleeve puts the record away and tapping it again plays it. The arm can be dragged, or clicked and then put down with a second click, onto any point of the side; from the keyboard it is a slider over the side's tracks.
- With the [Presence API](https://github.com/WordPress/presence-api) active, what a signed-in
  listener plays is shared with the site's other listeners, who see it under Listening now on a
  Listen page's Home and can press it to follow them. Following keeps time as cars in a light
  show do: while someone follows a listener, each of their plays, pauses, skips and seeks is due a
  second and a half ahead on the server's clock, which each follower has learned once as NTP does;
  it reaches every follower before it is due, they ready it, and everyone, the listener too, makes
  it at that moment. Nothing is corrected after. A press of the follower's own stops following,
  with Follow again in the bar; the listener sees who is with them. Together, a panel beside the
  page after Up next, lists who is in the session, with Leave for a follower, and outside one who else is
  listening, each with Follow; an album's page shows the faces of whoever is playing from it,
  and pressing one follows them. Other followers see a follower only if that follower shares what
  they play. A locked phone or a tab in the background has its timers slowed, so a change can
  reach it after it was due; it is joined once, where the music is by then, which the player
  says. Each listener turns sharing off under Personal Options on their profile; a site makes it
  off until turned on with the `riff_together_share` filter.
- The queue and position are kept for the tab's session. A full-page navigation saves them and
  attempts to resume on the next page; a reload restores the same track paused. A queue of more
  than 500 tracks keeps the 500 around the one playing, in the order they play.

On a keyboard:

| Keys | Action |
| --- | --- |
| Space or K | Play and pause |
| J and L | Back and forward ten seconds |
| Shift+N and Shift+P | Next and previous track |
| Escape | Close Now Playing |

Nothing fires while you type in a field. The single-key shortcuts act only for a signed-in listener,
who can turn them off under Personal Options on their profile (`Shortcuts` in PHP); a visitor has none, and a site can turn them off for everyone with the `riff.shortcuts`
filter, as WCAG 2.1.4 asks. Shift+N, Shift+P and Escape stay on either way.

A plugin adds keys of its own the same way it adds a control: it registers each on the server, on
the `riff_register` action, so the profile lists it under Riff's, and gives it what it does in the
browser by its id:

```php
add_action( 'riff_register', function () {
	riff_register_shortcut( 'loop', array(
		'key'   => 'o', // One character: a letter acts without Shift, whatever its case.
		'label' => __( 'Loop the section', 'my-plugin' ),
	) );
} );
```

```js
window.riff.shortcut( 'loop', ( track, event ) => toggleLoop( track ) );
```

A plugin's key is a single-key shortcut, so it keeps their rules: nothing while the listener types
in a field or holds Ctrl, Alt or Command, nothing until a track is loaded, and nothing for a
visitor, for a listener who turned the shortcuts off, or where the `riff.shortcuts` filter turns
them off. A mark typed with AltGr still counts where the browser reports AltGr, as that is how
many keyboards type one: `[` is AltGr+8 on a German keyboard. Alt and Option alone never do, as
they are the browser's and the system's, so a Mac with a German layout, which types `[` with
Option, can't reach a plugin's `[`; a letter or a digit is a key every keyboard types on its own. The profile's one
checkbox turns Riff's and every plugin's off together. Riff's own letters, K, J, L, N and P, and
Space are not a plugin's to take, nor is a key another plugin has; `riff_register_shortcut()`
refuses one, and returns `false`.

## Views

Now Playing is a view at a time, each taking the whole screen above the bar, opened from its button
at the bar's right end, and on a phone from its chip in Now Playing:

- **Album** (`album`): the cover on its own. It is what Now Playing opens to, and its button is on
  a phone's bar too, as the way in. The track's title and artist at the bar's left are read, not
  pressed.
- **Turntable** (`turntable`): the record out on the deck, playing or not, the sleeve beside it
  where the stage has room, and the record alone, turning in the cover's place, where it has not,
  as on a phone held upright. It is the listener's to open, as some would rather not have the
  motion, and Now Playing opens to it again for a listener who last chose it, a choice kept in the
  browser. An unfolded iPhone Duo always opens to it, as that is what the shape is for.
- **Lyrics** (`lyrics`), from Riff Lyrics; **Sing** (`sing`), from Riff Sing; **Chords**
  (`chords`), from Riff Chords; and any other a plugin registers. Each follows the song playing,
  so each is a screen of Now Playing rather than a panel.

Pressing the open view's button again, Escape, or Close goes back to the page, and focus goes back
to the button. The button says whether its view is open (`aria-pressed`).

**Up next** (`queue`) is a panel beside the page rather than a screen, as are **About**
(`about`), **Together** (`together`), for a signed-in listener where the Presence API is active,
and any panel a plugin registers: what they hold stands beside whatever is showing, the song's own
view included. One shows at a time:

- On a wide screen it stands beside the page and Now Playing, above the bar, and both make room
  for it. On a computer, where that leaves the page too little room for an album's rows beside the
  library, the library folds to its rail until the panel closes (a container query on the frame,
  in `desktop.css`).
- On a phone it covers everything, Now Playing too, as a dialog with its name and Close at the
  top.
- On a touch screen on its side, it opens in the controls' strip, and the turntable keeps
  turning beside it.

Focus moves to the panel's name as it opens, and Escape or Close hands it back to what opened it.
The one a listener leaves open opens again on their next visit, on a wide screen; that choice is
kept in the browser, nowhere else.

## About

About is the track playing: its cover, its title, its artist and its album, and the credits its
file's own tags carry. The artist and the album link to their pages in the Listen app: on a Listen
page the app opens them in place, and elsewhere they are the site's Listen page, the oldest
published one. The credits are what WordPress read from the file on upload, as the media route
hands them back in `media_details`: the composer, lyricist, conductor, the album's artist where it
is not the track's, genre, year, label, disc and track number, and copyright. Nothing is fetched
from anywhere else, and a tag the file lacks is left out; a file outside the Media Library, or one
the listener may not read, shows the track and no credits.

Its parts are sections, in the order the `riff_about_sections` filter gives them; Riff's own,
`track` and `credits`, are two of them. A plugin adds one there, which the page draws hidden as
`[data-riff-about="<id>"]` with its heading and an empty `.riff-about-body`, and fills it on the
`riff.view` action, as Riff fills its own, showing it when it has something for the track:

```php
add_filter( 'riff_about_sections', function ( $sections ) {
	$sections['tour'] = array( 'label' => __( 'On tour', 'my-plugin' ), 'order' => 30 );
	return $sections;
} );
```

```js
wp.hooks.addAction( 'riff.view', 'my-plugin', ( { id, open, view, track } ) => {
	const part = id === 'about' && open && view.querySelector( '[data-riff-about="tour"]' );
	if ( part ) {
		part.querySelector( '.riff-about-body' ).textContent = datesFor( track );
		part.hidden = ! part.querySelector( '.riff-about-body' ).textContent;
	}
} );
```

Riff's own sit at 10 (the track) and 20 (the credits). `riff.view` fires as the panel opens and
again as the track changes while it is open, so a section follows the song.

## Registering controls and views

The bar's controls and the views are registered on the server, as WordPress registers blocks and
settings, so the page has every button and every view before any script runs; the browser only
brings each to life by its id. Riff registers its own the same way, on the `riff_register` action:

```php
add_action( 'riff_register', function () {
	riff_register_control( 'sleep', array(
		'label'  => __( 'Sleep timer', 'my-plugin' ),
		'icon'   => '<svg viewBox="0 0 24 24">…</svg>',
		'order'  => 65,
		'script' => 'my-plugin-sleep', // A script module you register; Riff enqueues it with the player.
	) );
	riff_register_view( 'credits', array(
		'label'  => __( 'Credits', 'my-plugin' ),
		'icon'   => '<svg viewBox="0 0 24 24">…</svg>',
		'order'  => 32,
		'place'  => 'screen', // Or 'side', for a panel beside the page.
		'render' => fn() => '<p>' . esc_html__( 'Loading…', 'my-plugin' ) . '</p>',
	) );
} );
```

A control's `order` places it among Riff's own: Like (10), the badges (20), the album (26), the
turntable (28), Lyrics (30), Sing (32), Chords (34), About (36), Up next (40), Together (45), Play on another
device (60) and the volume (70). `wide`
keeps a control's button off a phone's bar, which holds the track, Play, the album and only what a
control asks to keep there; a view's button is wide unless it says otherwise. A control can bring
its own markup with `render` in place of a button. An icon is the name of one of Riff's own or SVG,
and nothing but its shapes is kept. `riff_unregister_control()` and `riff_unregister_view()` take
one away, Riff's own included.

In the browser, `window.riff.control( id, control )` gives a registered control its `run( track,
button )`, `pressed( track )`, `label( track )` and `shown( track )`, and
`window.riff.view( id, view )` gives a registered view its `render( view, track )`, which fills it
as it opens and again as the track changes while it is open; the `riff.view` action says the same.
Both also add a control or a view the server didn't register, for what only the browser knows.
`window.riff.openView( id )` and `closeView()` open and close one. The bar is updated in place as
the track changes and never drawn again, so a control keeps focus while the music plays.
[docs/javascript.md](javascript.md) has the whole of it.

## The track menu

The ⋯ beside every row and every track in Up next opens the track menu. A plugin adds its own
items with the `riff.menu` filter, from a script that depends on `wp-hooks`. Each item is
`{ id, label, run }`, or `{ id, label, href }` for a link, and the menu shows the items in the
order the filter returns them. The filter is handed Riff's own, in order, each only where it
applies: `next`, `add`, `like`, `playlist`, in Up next `up`, `down` and `remove`, and Go to post,
`post`, with what Riff's own features add, as Listen along, among them. Go to post leaves the
page, so an item that stays goes before it. In a window of its own, Riff's desktop app or the
Listen app installed, it opens the post in a new window instead, so the app stays where it was,
with WordPress's external icon after it and core's "(opens in a new tab)" for a screen reader:

```js
wp.hooks.addFilter( 'riff.menu', 'my-plugin', ( items, track, context ) => {
	const practice = {
		id: 'my-plugin-practice',
		label: __( 'Practice this', 'my-plugin' ),
		run: () => startPractice( track ),
	};
	const at = items.findIndex( ( item ) => item.id === 'post' );
	return at < 0
		? [ ...items, practice ]
		: [ ...items.slice( 0, at ), practice, ...items.slice( at ) ];
} );
```

`context` says where the menu was opened: `where` is `row`, a row on the page, or `queue`, with
the track's place in the queue as `index`. The label is plain text. `run` is called once the
menu has closed and focus is back on the ⋯. An item with no label, or with neither `run` nor
`href`, is left out. [docs/hooks.md](hooks.md#riffmenu) has the reference.

## Areas

The player has places Riff's own features fill: **badges**, the pills at the bar's right end and
under the title in Now Playing, and on a phone small print between the seek line's times; and the
**meter**, the music's level each frame, which lights the seek line and moves the playing row's
bars. The quality pill is a badge, and the seek line's glow is a meter listener.

They are internal for now, on the object Riff hands its own Listen app, and not yet on
`window.riff`: they become public once they have settled, as the track menu has. Each works
through `listen( name, fn )`:

| Name | `fn` is called with | and returns |
| --- | --- | --- |
| `badges` | the badges so far, and the playing track | the badges, each `{ id, text, label? }` |
| `meter` | `{ heat, levels }` each frame while music plays and the bar, Now Playing or the playing row is in sight: heat from 0 to a little over 1, and three bands from 0 to 1, or `null` while the line cools | nothing |

The badges are redrawn only when what they hold changes.

## Addresses

| Address | What it opens |
| --- | --- |
| A post's address with `?riff_track=<id>` | The post on that track, focused and not playing. Whatever is already playing is left alone. This is what Share links to. |
| A Listen page with `?riff_page=2` | The same posts Load more showed, when reloaded or shared. It works without JavaScript. |

## A Listen page

A dedicated Listen page lists posts with audio or video. Opening a post keeps you on that page
while its tracks play, and Load more adds the next page of posts in place. To make one, do any of
these:

- Press **Create Listen page** in the notice Riff shows on the Dashboard after activation.
- Create a WordPress page and add the Riff block.
- Put `[riff]` in a page's content.

Listeners can install the Listen page's `app/` address as an app of its own. From their second visit Riff offers it, with the browser's own Install where there is one (Chrome and Edge) and the steps where there is not (Safari's Add to Dock and Add to Home Screen). Installed from Chrome or Edge on a computer it has no title bar and is laid out as the desktop app is. Its name and icon are the site's, so set a site icon under **Settings › General**.

## Video versions

A track with a video version is set in the Media Library: click an audio file and choose a video
under **Video version**. It opens as the video, unless the listener last chose the song or their
browser asks to save data; a site makes the song first with the `riff_video_first` filter.
Pressed in a post or the Listen app, a track that opens as its video opens Now Playing on the
picture and plays, as a video block's track does; one that opens as the song plays where it is.

## Design

In a window with room for the sidebar the Listen app is laid out as a desktop streaming app is: back and forward, home and search across the top, the library and the view as panels on black, and the player bar along the bottom with the seek line under the controls. A narrower window keeps the touch layout, whatever points at it, so a car's screen is laid out as a phone is. The choice is made once, in `standalone.css` (`--riff-frame`), and the page's script reads it from there. It's all in Riff's ivory, a piano key's cream. [DESIGN.md](../DESIGN.md) has the rest.

## Folding phones and phones on their side

Riff lays out by the screen's shape, never by the device, as WebKit and Apple ask: an iPhone Duo says it is an iPhone, and folds and unfolds while the page is open.

- **A touch screen wider than it is tall and no taller than a phone** (an unfolded iPhone Duo at 890 by 626, any phone on its side) is the turntable itself: Now Playing opens to the Turntable view whatever the listener chose elsewhere, the deck, the record and the arm filling its height on the left and the controls in a strip down the right. Up next and the other panels open in that strip, and the deck keeps turning beside it. The deck has its own controls on its plinth: Start · Stop, the two speeds (an LP at 45 runs fast, as on a deck; a new record starts at its own speed) and a pitch fader, ±8%, which moves the music, its pitch, the platter, the strobe and the arm together. Off the deck the music plays at its own speed. Once the record is out, its sleeve stands in a rack at the top of the strip. Opening the phone brings the record out of its sleeve onto the platter; closing it puts the record back, and Now Playing is the phone's again. In the Listen app an album opens as a gatefold sleeve: the cover on the left page, the tracks on the right.
- **A short screen that is not upright enough to be a phone** (a folded iPhone Duo's outer screen at 466 by 678) puts Home, Search and Library down the right edge, where iOS keeps its own bars on that screen.
- **Folded part way**, where the browser reports the fold (Safari 27.1's Viewport Segments API, behind a flag for now), nothing lands in the crease: like a book, the deck fills the left page and the controls the right; stood like a tent, the sleeve and the turntable fill the upper half and the controls the lower, nearer the hand.

`plugins/riff/tests/e2e/player/duo.spec.js` emulates the hinge through Chromium's DevTools protocol.

## The turntable

The turntable is a view of its own (above). Under the deck it has a VU meter and a spectrum
(`assets/player/meters.js`), read from the music where it passes through Web Audio, as it does
everywhere but an iPhone. The VU meter is IEC 60268-17's: a needle on the rectified signal that
reaches 99% of a steady tone's reading in 300 ms and passes it by about 1%, with 0 VU a sine at
-14 dBFS, the loudness the streaming services play at. The spectrum is 31 one-third-octave bands
from 20 Hz to 20 kHz, each averaged over IEC 61672's Slow second, so a lossy file shows where its
encoder stopped: a 128 kbps MP3 has nothing above about 16 kHz. Their row is kept from the moment
the view opens, so the deck doesn't change size when the music first plays and they are drawn.
Neither is shown with the video, for a listener who asks for less motion, or for a file from
another origin that doesn't share over CORS, which Web Audio can't hear. A site that wants the cover on its own registers none:
it turns the turntable off under **Settings › Media** (Now Playing), or with the `riff_turntable`
filter. Off, there is no Turntable button or chip, the record never comes out of its sleeve, and a
touch screen on its side or a folding phone shows the cover beside the controls, with no deck board
or rack.
