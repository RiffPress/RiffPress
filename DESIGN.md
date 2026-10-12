# Design

## Product Character

Riff is a music player that sits inside someone else's site. The player is always dark and always the same; the page around it belongs to the theme. Administration uses WordPress conventions without a separate branded shell: one field on audio files in the Media Library.

## Visual System

### The player

YouTube Music's current layout and measurements are the authority: the 72px bar on a wide screen, the 2025 Now Playing on a phone, Roboto, Material Icons, `#212121` surfaces on `#030303`. Riff's own marks are the amber accent (`#ffb020`) in place of red, and the filament: the played part of the bar's seek line glows with the music, in heat colours from near-black red through amber to yellow-white, and cools when playback stops. The bloom spreads down into the bar, never up into the page.

### Rows in the post

Tracks are rows inside the post's own content and take the theme's colours through `currentcolor`. They add nothing the theme has to style.

## Layout

Phone: the bar along the bottom with its progress line on the top edge; Now Playing full-screen with the Song/Video switch at the top, square art, title and artist, a thick thumbless seek bar, the controls, action pills, and a handle for Up next that opens to a split view and then a full list. Wide screen: the bar keeps the controls, and Now Playing fills the space above it with the art on the left and Up next on the right.

## Interaction

Tap a row to play, tap the bar for Now Playing, swipe the bar to skip, drag Now Playing down to close. Motion is transform and opacity only. Reduced motion removes the transitions and holds the filament at half; reduced transparency removes the halo.

## Accessibility

Native `<audio>` and `<video>` underneath, a native range for seeking, labelled buttons whose labels change with state, a dialog that makes the page inert and returns focus, visible focus rings, and 44px targets on a phone.
