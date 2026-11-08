# Accessibility

How the player and the Listen app are built to be used by everyone, and how a change keeps it so. The floor is WCAG 2.2 AA. Read this before adding a control, a view or an announcement.

## What the page is

- **The bar** is a `section` named Player, at the foot of every page with a track. Its buttons keep their names while their state changes: `aria-pressed` for Shuffle, Like and each view's button, and Repeat, which has three states, says its state after its name ("Repeat, all"). The track's title and artist at its left are the button that opens Now Playing, read as "Now Playing, <title>, <artist • album>", with `aria-haspopup="dialog"` and `aria-expanded` saying whether it is open. The heart is "Like <title>", as each row's is.
- **Now Playing** is a `dialog`. On a phone it covers the bar, so it is `aria-modal` and everything else is `inert`; Tab stays inside it and Escape closes it, returning focus to the opener. On a wide screen it sits above the bar and is not modal, because the bar is still how the music is controlled. Now Playing shows one view at a time (the album, which is the cover or the turntable by Now Playing's shape, a plugin's such as the lyrics, Sing or Chords). The album opens from the bar's track button; every other view from a toggle button in the bar (`aria-pressed`), and on a phone from its chip; a view with a region of its own, such as the lyrics, is a `region` named for it, and focus moves into it as it opens. Pressing the open view's button again, Escape or Close returns focus to the button. Up next, About, and Together for a signed-in listener, are panels: beside the page on a wide screen, a `complementary` landmark named for it; over everything on a phone, an `aria-modal` `dialog`, with everything else `inert` and Tab kept inside. Focus moves to its heading as it opens, and Escape or Close returns it to the button that opened it. About holds the track's title as a heading, its artist and album as links named by their names, and its credits as a description list, each tag's name beside what it says. A plugin's view or control is registered on the server and is the same.
- **A track's row** in a post is a button named by what it shows, after a word only a screen reader hears: "Play <title>, <artist> • <album>, <length>", then "Pause …" while it plays, with "More options for <title>" after it. Up next's rows are named the same way. Every word a control shows is in its name (WCAG 2.5.3), so someone using speech input can say what they see. The … opens a `menu` of `menuitem`s with arrow keys and Escape.
- **The seek line** is a native range named Track position, whose `aria-valuetext` is its time in words, "11 seconds of 8 minutes, 57 seconds", and whose arrows move five seconds. Volume is a native range, spoken as "80 percent", and "Muted" at nothing, beside a Mute toggle button.
- **The Listen app** is a `navigation` named Riff, a `search` form whose field is a `combobox` over a `listbox` of suggestions, and views with one heading each. A view change moves focus to the heading, which is how it is announced.

Each track in Up next carries `aria-posinset` and `aria-setsize`, so a screen reader says "2 of 10" as the list is read, and a title in another language than the page's carries its `lang`, so it is pronounced in that language.

## What is said

Everything that changes without the listener's focus being on it is spoken through WordPress's live regions, `wp.a11y.speak()`, never a region of Riff's own: the player and the app share those regions with whatever else is on the page.

| When | Said |
| --- | --- |
| A track starts, from a row, Next or Previous, once its sound does | "Now playing <title> by <artist>" |
| A track cannot be played, and the next is tried | "Couldn’t play <title>.", and the row reads "Couldn’t be played" |
| A third track in a row cannot be played, and the player stops | "These tracks couldn’t be played." |
| Play next, Add to queue | "<title> plays next", "<title> added to the queue" |
| A track moved, removed, the queue cleared | "Moved to 3 of 10", "<title> removed from the queue", "Queue cleared" |
| A notice (a toast) | its words |
| Search suggestions | "N suggestions" |
| A playlist renamed or deleted | "Renamed <name>", "<name> deleted" |
| Riff Sing: a line of the melody ends while someone sings | "That line: Lovely singing. 72% in tune." |
| Riff Sing: the microphone or MIDI starts, stops, isn't allowed or goes away | its status, such as "Listening. Play the song and sing along; headphones work best." |
| Riff Sing, a duet: either of the above, for one of its two singers | the same, after the singer's name: "Singer 2: That line: Brilliant! 90% in tune." What both singers are told at one moment, as when a line they sing together ends, is said as one announcement. Each singer's lane and controls are a group named for them. |

A change the listener made with focus on the control is not repeated: the control's own state (`aria-pressed`, the row's new name) says it.

## The keyboard

Space or K plays and pauses, J and L skip ten seconds, Shift+N and Shift+P change track, Escape closes Now Playing. Nothing fires in a field. The single-key ones act only for a signed-in listener, who can turn them off under Personal Options on their profile; a visitor has only the Shift ones and Escape, and a site can turn the single-key ones off for everyone with the `riff.shortcuts` filter. That is what WCAG 2.1.4 asks. Every swipe and drag has a button or a key that does the same: Next and Previous for a swipe across the bar, Close for a drag down on Now Playing, and Close player in Up next's header for a swipe down on the bar (WCAG 2.5.7).

## Seeing

- Every colour comes from `tokens.css`, and `.github/scripts/contrast.test.js` holds each pair the player and the app draw text or a control in to 4.5:1 or 3:1.
- `prefers-reduced-motion` stops the equaliser and the sliding sheets. A contrast theme (`forced-colors`) keeps the seek line, the current row and an open panel's button told apart in the system's colours.
- Every control is at least 24 by 24 pixels (WCAG 2.5.8), and the bar never covers what has focus: the document carries `scroll-padding-bottom` for the bar's height while it shows (2.4.11).
- Nothing plays until Play is pressed, a reload included (1.4.2).
- A video version with captions gets a Captions switch at the top of Now Playing, in video mode; the browser draws the captions, and the choice is kept on the device (1.2.2).
- The large cover in Now Playing says what it shows, the album and the artist; the small covers beside a title are decoration, since the title says it.

## How it is kept

- **axe** runs in the e2e suites at the `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa` and `best-practice` rule sets, on every view of the app at three widths, on Now Playing, on the components page with every component in every state.
- **`tests/e2e/player/wcag.spec.js`** holds the criteria a docked player trips on: target size, focus not obscured, audio control, the modal's Tab, the bar's names.
- **`tests/e2e/player/aria.spec.js` and `app/aria.spec.js`** are the tree as the spec: an aria snapshot of each surface in each state (a post's rows, the bar, Now Playing, the Up next and About panels, a row's menu, the Lyrics panel; the app's bar, a post, the lists, search), matched as a subset, so a name, a role or a state cannot change unreviewed. A change to a surface starts by changing its snapshot.
- **The accessibility tree** is read directly where it matters: `#a11y-speak-polite` for what is said, `aria-valuetext` for the slider, the focus order through Now Playing and out to the bar.
- **`docs/screen-reader-checklist.md`** is run with real screen readers before a release that touches the surface.

## Media

- **Captions.** A video version's captions are the WebVTT file its Captions field in the Media Library names, or the text tracks its video block carries; the track carries them as `captions`, and the player shows them as `<track>` elements on its video with a Captions control in Now Playing.
- **Transcript.** Timed lyrics are the song's transcript (1.2.1, 1.2.2): the lines are text, read as a list, and the one being sung is marked.
- **Alt text.** A cover's alt text is the image's own from the Media Library; a cover Riff draws says the album and artist it draws. The player's large cover in Now Playing carries it; a row's, a card's or About's cover is `alt=""`, since the title beside it says what it is.
- **Language.** The language a file's tags name is kept on upload as `language` and reaches the track as `lang`, which the player puts on a title in another language than the page's, so a screen reader pronounces it.

## Adding something

A control needs a name (`aria-label` or text), its state when it has one (`aria-pressed`, `aria-expanded`, `aria-current`), an icon that is `aria-hidden`, 24 pixels each way, and a word for the listener when it changes something they aren't looking at, through `speak()`. A control registered with `riff_register_control()` gets its name and icon from its `label` and `icon`, and its state from `window.riff.control()`'s `pressed( track )`. A view needs one heading and gets focus moved to it. A dialog needs a name, a close control, Escape, and focus returned to its opener. Then an aria snapshot or an assertion in the spec that owns it, so a screen reader's view of it is reviewed as code.
