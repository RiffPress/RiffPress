# Screen-reader checklist

Playwright reads the accessibility tree, runs axe at the WCAG 2.2 AA rule set, and watches the live regions, on every change. None of that is a screen reader. What VoiceOver says while a slider is dragged, where NVDA's browse mode lands beside a dialog that is not modal, and how the announcements sound against the music are only heard with one running. Run this list before a release that touches `riff.js`, the player template, the Listen app or the stylesheets, and record the result in the release pull request.

Record each check as **pass**, **fail** or **unverified**, with the screen reader, its version, the browser and the Riff version. A check that wasn't run is unverified, not a pass. A fail is an issue with the Accessibility label.

Run it with at least two of: VoiceOver with Safari on a Mac, VoiceOver on an iPhone, NVDA with Firefox, JAWS with Chrome, TalkBack with Chrome. Windows High Contrast and 400% zoom are at the end.

Use the demo at https://riffpress.com/demo, or any post with at least three tracks, and a page with the Listen block.

## The post

1. Move through the post to the first track. Its row is a button, "Play <title>", and the … after it is "More options for <title>".
2. Press it. You hear "Now playing <title> by <artist>", and the row's button is now "Pause <title>".
3. The bar at the foot of the page is a region named Player. Its first button is "Open Now Playing: <title> by <artist>"; then Shuffle, Previous, Pause, Next, Repeat, the Seek slider, Like, the quality pill, Volume on a computer, and a second "Open Now Playing".
4. On the Seek slider, press the right arrow. You hear a time, "11 seconds of 8 minutes, 57 seconds", five seconds on from before. Drag it with the screen reader's own gesture: the time keeps being spoken.

## Now Playing

5. Open Now Playing. On a phone it is a dialog that keeps you inside it; Escape, or the Close button, returns you to the button you opened it from. On a computer it is not modal, and you can move out to the bar and back.
6. Move through it: the keyboard-shortcuts switch and its state, Up next and Lyrics as tabs, Clear the queue, then each track as "Play <title> by <artist>" with "More options" after it, the playing one "Pause …".
7. Open a row's More options. The first item has focus; the arrows move through Play next, Add to queue, Add to Liked songs, Move up or down, Remove from queue, Go to post; Escape returns you to the … button.
8. Choose Play next. You hear "<title> plays next". Choose Remove from queue on another. You hear "Removed from the queue". Clear the queue. You hear "Queue cleared".
9. Press the keyboard-shortcuts switch. You hear "Keyboard shortcuts off". Press K. Nothing happens. Press it again, then K. The track pauses.

## The Listen app

10. On the Listen page, the app bar is a navigation named Riff, the search field a combobox named Search music, and the page has one main heading.
11. Open Albums from the sidebar. Focus moves to the heading "Albums" and you hear it. Open an album; focus moves to its name.
12. Type two letters in search. You hear "N suggestions"; the down arrow moves through them and Enter opens one. Type nonsense. You hear "0 suggestions".
13. Like a song with its heart. The heart reads "Liked" or pressed; Your Library's Liked songs lists it.

## Lyrics

14. With a track that has lyrics, open the Lyrics tab. The lines are read as a list; a timed line is a button, and pressing it moves the track there.

## Seeing

15. Windows High Contrast, or the forced-colours setting: the seek line, the current row, the open tab and the pressed buttons are still told apart.
16. 400% zoom at 1280 pixels wide: nothing is cut off, nothing scrolls sideways, and every control is still reachable.
