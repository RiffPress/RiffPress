# Accessibility

How the player and the Listen app are built to be used by everyone, and how a change keeps it so. The floor is WCAG 2.2 AA. Read this before adding a control, a view or an announcement.

## What the page is

- **The bar** is a `section` named Player, at the foot of every page with a track. Its buttons carry their names and their state (`aria-pressed` for Shuffle, Repeat, Like and the shortcuts switch; `aria-expanded` on the two that open Now Playing). The track's own button is named for the track, "Open Now Playing: <title> by <artist>", so the two are told apart.
- **Now Playing** is a `dialog`. On a phone it covers the bar, so it is `aria-modal` and everything else is `inert`; Tab stays inside it and Escape closes it, returning focus to the opener. On a wide screen it sits above the bar and is not modal, because the bar is still how the music is controlled. Up next and Lyrics are `tabs` with panels; a plugin's tab comes through `riff_now_playing_tabs` and is the same.
- **A track's row** in a post is a button, "Play <title>", then "Pause <title>" while it plays, with "More options for <title>" after it. Up next's rows are "Play <title> by <artist>". The … opens a `menu` of `menuitem`s with arrow keys and Escape.
- **The seek line** is a native range named Seek, whose `aria-valuetext` is its time in words, "11 seconds of 8 minutes, 57 seconds", and whose arrows move five seconds. Volume is a native range.
- **The Listen app** is a `navigation` named Riff, a `search` form whose field is a `combobox` over a `listbox` of suggestions, and views with one heading each. A view change moves focus to the heading, which is how it is announced.

Each track in Up next carries `aria-posinset` and `aria-setsize`, so a screen reader says "2 of 10" as the list is read, and a title in another language than the page's carries its `lang`, so it is pronounced in that language.

## What is said

Everything that changes without the listener's focus being on it is spoken through WordPress's live regions, `wp.a11y.speak()`, never a region of Riff's own: the player and the app share those regions with whatever else is on the page.

| When | Said |
| --- | --- |
| A track starts, from a row, Next or Previous | "Now playing <title> by <artist>" |
| Play next, Add to queue | "<title> plays next", "<title> added to the queue" |
| A track moved, removed, the queue cleared | "Moved to 3 of 10", "Removed from the queue", "Queue cleared" |
| A notice (a toast) | its words |
| Search suggestions | "N suggestions" |
| A playlist renamed or deleted | "Renamed <name>", "<name> deleted" |
| The shortcuts switch | "Keyboard shortcuts on" or "off" |

A change the listener made with focus on the control is not repeated: the control's own state (`aria-pressed`, the row's new name) says it.

## The keyboard

Space or K plays and pauses, J and L skip ten seconds, Shift+N and Shift+P change track, Escape closes Now Playing. Nothing fires in a field. The single-key ones can be turned off by the listener with the switch at the top of Now Playing, kept on the device, and by a site for everyone with the `riff.shortcuts` filter, which is what WCAG 2.1.4 asks. Every swipe and drag has a button or a key that does the same: Next and Previous for a swipe across the bar, Close for a drag down on Now Playing, and Stop at the top of Now Playing for a swipe down on the bar (WCAG 2.5.7).

## Seeing

- Every colour comes from `tokens.css`, and `.github/scripts/contrast.test.js` holds each pair the player and the app draw text or a control in to 4.5:1 or 3:1.
- `prefers-reduced-motion` stops the filament, the equaliser and the sliding sheets; `prefers-reduced-transparency` removes the washes. A contrast theme (`forced-colors`) keeps the seek line, the current row and the open tab told apart in the system's colours.
- Every control is at least 24 by 24 pixels (WCAG 2.5.8), and the bar never covers what has focus: the document carries `scroll-padding-bottom` for the bar's height while it shows (2.4.11).
- Nothing plays until Play is pressed, a reload included (1.4.2).
- A video version with captions gets a Captions switch at the top of Now Playing, in video mode; the browser draws the captions, and the choice is kept on the device (1.2.2).
- The large cover in Now Playing says what it shows, the album and the artist; the small covers beside a title are decoration, since the title says it.

## How it is kept

- **axe** runs in the e2e suites at the `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa` and `best-practice` rule sets, on every view of the app at three widths, on Now Playing, on the components page with every component in every state.
- **`tests/e2e/player/wcag.spec.js`** holds the criteria a docked player trips on: target size, focus not obscured, audio control, the modal's Tab, the bar's names.
- **`tests/e2e/player/aria.spec.js` and `app/aria.spec.js`** are the tree as the spec: an aria snapshot of each surface in each state (a post's rows, the bar, Now Playing with Up next, a row's menu, the Lyrics tab; the app's bar, a post, the lists, search), matched as a subset, so a name, a role or a state cannot change unreviewed. A change to a surface starts by changing its snapshot.
- **The accessibility tree** is read directly where it matters: `#a11y-speak-polite` for what is said, `aria-valuetext` for the slider, the focus order through Now Playing and out to the bar.
- **`docs/screen-reader-checklist.md`** is run with real screen readers before a release that touches the surface.

## Media

- **Captions.** A video version's captions are the WebVTT file its Captions field in the Media Library names, or the text tracks its video block carries; the track carries them as `captions`, and the player shows them as `<track>` elements on its video with a Captions control in Now Playing.
- **Transcript.** Timed lyrics are the song's transcript (1.2.1, 1.2.2): Riff Lyrics shows them following the music, and a switch above them shows the same words as plain text in one piece.
- **Alt text.** A cover's alt text is the image's own from the Media Library; a cover Riff draws says the album and artist it draws. The player's large cover in Now Playing carries it; a row's or a card's cover is `alt=""`, since the title beside it says what it is.
- **Language.** The language a file's tags name is kept on upload as `language` and reaches the track as `lang`, which the player puts on a title in another language than the page's, so a screen reader pronounces it.

## Adding something

A control needs a name (`aria-label` or text), its state when it has one (`aria-pressed`, `aria-expanded`, `aria-current`), an icon that is `aria-hidden`, 24 pixels each way, and a word for the listener when it changes something they aren't looking at, through `speak()`. A control in the player's areas (`own.controls`) gets the first three from its `label`, `pressed` and `icon`. A view needs one heading and gets focus moved to it. A dialog needs a name, a close control, Escape, and focus returned to its opener. Then an aria snapshot or an assertion in the spec that owns it, so a screen reader's view of it is reviewed as code.
