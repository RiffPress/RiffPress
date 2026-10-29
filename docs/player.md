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
- On the turntable, tapping the sleeve puts the record away and tapping it again plays it. The arm can be dragged, or clicked and then put down with a second click, onto any point of the side; from the keyboard it is a slider over the side's tracks.
- The queue and position are kept for the tab's session. A full-page navigation saves them and
  attempts to resume on the next page; a reload restores the same track paused.

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

## Areas

The player has places that features fill: **badges**, the pills at the bar's right end and under
the title in Now Playing, and on a phone small print between the seek line's times, as Tidal sets its tier; **controls**, buttons beside them; and the **meter**, the music's level
each frame, which lights the seek line and moves the playing row's bars. Riff's own features use
them as any feature would: the quality pill is a badge, and the seek line's glow is a meter
listener.

They are internal for now, on the object Riff hands its own Listen app, and not yet on
`window.riff`: they become public once they have settled. Each works as the track menu does,
through `listen( name, fn )`:

| Name | `fn` is called with | and returns |
| --- | --- | --- |
| `badges` | the badges so far, and the playing track | the badges, each `{ id, text, label? }` |
| `controls` | the controls so far, and the playing track | the controls, each `{ id, label, icon?, pressed?, run( track ) }` |
| `meter` | `{ heat, levels }` each frame while music plays: heat from 0 to a little over 1, and three bands from 0 to 1, or `null` while the line cools | nothing |

An area is redrawn only when what it holds changes, so a control keeps focus while the track plays,
and a control's `run` redraws them after it. A control's `icon` is markup from the feature's own
code.

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
under **Video version**.

## Design

On a computer the Listen app is laid out as a desktop streaming app is: back and forward, home and search across the top, the library and the view as panels on black, and the player bar along the bottom with the seek line under the controls. Phones and tablets keep a touch layout. It's all in Riff's ivory, a piano key's cream. [DESIGN.md](../DESIGN.md) has the rest.

## Folding phones and phones on their side

Riff lays out by the screen's shape, never by the device, as WebKit and Apple ask: an iPhone Duo says it is an iPhone, and folds and unfolds while the page is open.

- **A touch screen wider than it is tall and no taller than a phone** (an unfolded iPhone Duo at 890 by 626, any phone on its side) is the turntable itself: Now Playing is the deck, the record and the arm filling its height on the left and the controls in a strip down the right. Up next opens in that strip, and the deck keeps turning beside it. Opening the phone brings the record out of its sleeve onto the platter; closing it puts the record back, and Now Playing is the phone's again. In the Listen app an album opens as a gatefold sleeve: the cover on the left page, the tracks on the right.
- **A short screen that is not upright enough to be a phone** (a folded iPhone Duo's outer screen at 466 by 678) puts Home, Search and Library down the right edge, where iOS keeps its own bars on that screen.
- **Folded part way**, where the browser reports the fold (Safari 27.1's Viewport Segments API, behind a flag for now), nothing lands in the crease: like a book, the deck fills the left page and the controls the right; stood like a tent, the sleeve and the turntable fill the upper half and the controls the lower, nearer the hand.

`plugins/riff/tests/e2e/player/duo.spec.js` emulates the hinge through Chromium's DevTools protocol.
