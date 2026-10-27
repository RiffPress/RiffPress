# Design

## Product Character

Riff is a music player that sits inside someone else's site. The player is always dark and always the same; the page around it belongs to the theme. Administration uses WordPress conventions without a separate branded shell: two fields on audio files in the Media Library, Artwork (the attachment's own featured image) and Video version.

## Visual System

### The player

YouTube Music's current layout and measurements are the authority, except the wide bar's arrangement, which follows Tidal: the 72px bar on a wide screen, the 2025 Now Playing on a phone, Roboto, Material Icons, `#212121` surfaces on `#030303`. Riff's own marks are the ivory accent (`#f2eadb`, a piano key's cream) in place of red, the dark-mode mirror of the site's charcoal on paper, and the filament: the played part of the bar's seek line glows with the music, a dim ember when it is quiet, a warm ivory light at working level and a pale white heart at the peaks, and cools when playback stops. Each layer has one colour and only fades, and the line moves on the compositor. The bloom is a soft band either side of the line that fades out before the knob, and stays on the bar's line; Now Playing's own seek line is plain white.

### The Listen block

The library page follows the theme. On a block theme it takes the theme's background, text and link colours and its fonts from global styles, and mixes the quieter shades from them. On a classic theme it uses WordPress.org's design system: its palette, Inter for text, EB Garamond for headings, and 2px corners.

### Rows in the post

Tracks are rows inside the post's own content and take the theme's colours through `currentcolor`. They add nothing the theme has to style.

## Layout

Phone: the bar along the bottom with its progress line on the top edge; Now Playing full-screen with the Song/Video switch at the top, square art, title and artist, a thick thumbless seek bar, the controls, action pills, and a handle for Up next that opens to a split view and then a full list. The Listen app on a phone, as the apps lay theirs out: one slim row at the top with the site's name and who is listening, Albums, Artists, Tracks and Posts as chips under it on Home and on those lists, and Home, Search and Library as tabs along the bottom with the bar sitting on them; Search opens a view of its own, the field and the lists as tiles. Wide screen: the bar is laid out as Tidal's, the track on the left, shuffle, previous, play, next and repeat in the middle with the seek line and both times under them, where they are easy to reach, and volume, the quality pill and the caret on the right; Now Playing fills the space above it with the art on the left and Up next on the right.

The art is a record in its sleeve. Where the stage is wider than it is tall (a computer, an unfolded phone, a phone on its side), the record slides out once the album plays and the sleeve is set down beside it, each as large as the stage allows. On a phone held upright the cover stands alone at full size, and play and pause act at once. The record is cut as a 12-inch LP: a label a third of its width printed in the cover's colours, smooth dead wax, a band of grooves for each track as wide as the track is long, and a smooth lead-in rim. It turns clockwise at 33⅓, scaled by the playback speed. The tonearm tracks the album from the outside in, so each angle is one moment of it, and swings to a new track. A new album puts the record back in its sleeve and the next one comes in. The Albums view can also stand its cards in a rack, spines out, each spine in its cover's colour.

The desktop app: Spotify's frame. A 64px black strip with back and forward beside the traffic lights and home and search in the middle; under it the library and the view as `#121212` panels, 8px apart with 8px corners, on black; the bar black below them. Its Mac icon is the record on Apple's icon grid, on Riff's blue, with one groove lit amber as the filament.

## Interaction

Tap a row to play, tap the bar for Now Playing, swipe the bar to skip, drag Now Playing down to close. Motion is transform and opacity only. Reduced motion removes the transitions and holds the filament at half; reduced transparency removes the halo.

## Accessibility

Native `<audio>` and `<video>` underneath, a native range for seeking, labelled buttons whose labels change with state, a dialog that makes the page inert and returns focus, visible focus rings, and 44px targets on a phone.
