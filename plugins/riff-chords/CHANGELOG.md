# Changelog

## [0.3.1](https://github.com/RiffPress/RiffPress/compare/riff-chords-v0.3.0...riff-chords-v0.3.1) (2026-11-03)


### Bug Fixes

* **player:** a view's button shows only for a track it has something for, and an open view gives way to one without ([#873](https://github.com/RiffPress/RiffPress/issues/873)) ([33d83b2](https://github.com/RiffPress/RiffPress/commit/33d83b2bb1e4b34d06ce488e03e3a214d06fa6c5))

## [0.3.0](https://github.com/RiffPress/RiffPress/compare/riff-chords-v0.2.0...riff-chords-v0.3.0) (2026-11-03)


### Features

* **sing:** a track with Riff Lyrics' timed lyrics shows its words under the lane at Riff Lyrics' times ([#855](https://github.com/RiffPress/RiffPress/issues/855)) ([e5ac358](https://github.com/RiffPress/RiffPress/commit/e5ac3588d9195112c0f810f1568bd20c9ad27fc1))


### Bug Fixes

* **sing:** through a break the lyrics mark, the next line waits under the lane, and lyrics whose file tag starts with a blank line are still read as timed ([#857](https://github.com/RiffPress/RiffPress/issues/857)) ([404a7a1](https://github.com/RiffPress/RiffPress/commit/404a7a14c57fa3bdf45111e4f599624d7a11df51))

## [0.2.0](https://github.com/RiffPress/RiffPress/compare/riff-chords-v0.1.0...riff-chords-v0.2.0) (2026-11-03)


### Features

* **chords:** a count-in at the chart's tempo over a loop's last bar, off until it is turned on ([#840](https://github.com/RiffPress/RiffPress/issues/840)) ([d3f4ef3](https://github.com/RiffPress/RiffPress/commit/d3f4ef3537ee7f1f8887c44d311e219b98e03d99))
* **chords:** keys for the loop, the speed and transpose, A, S and F, D and U, while the Chords view shows a chart ([#849](https://github.com/RiffPress/RiffPress/issues/849)) ([9fe8131](https://github.com/RiffPress/RiffPress/commit/9fe81310bd5961de8c20e4c126935aa2fe9af3b5))
* **chords:** Practice this in a track's menu, for a track with a chart, plays it and opens the Chords view on it ([#850](https://github.com/RiffPress/RiffPress/issues/850)) ([36e9980](https://github.com/RiffPress/RiffPress/commit/36e998088452e7be84db0fefda51f4af71c51a03))
* **chords:** ukulele fingerings and a piano's keys beside the guitar's, chosen in the Chords view and kept in the listener's browser ([#839](https://github.com/RiffPress/RiffPress/issues/839)) ([4bb5928](https://github.com/RiffPress/RiffPress/commit/4bb592894cdcf64b3c2d47a3ea7273a0647df662))


### Bug Fixes

* **chords:** a piano names each note as its chord spells it and draws its keys white and black on any theme, and the key line is the key the song sounds in ([#846](https://github.com/RiffPress/RiffPress/issues/846)) ([23b183e](https://github.com/RiffPress/RiffPress/commit/23b183e036427d0ce961e27611663a8dc51ca92e))
* **chords:** Practice this keeps the queue's order, shuffle and later pages, and is offered only for a chart the visitor can read ([#851](https://github.com/RiffPress/RiffPress/issues/851)) ([3a98318](https://github.com/RiffPress/RiffPress/commit/3a9831833e1b561a7fde12da65f05cbfa3575b32))
* **chords:** Practice this plays a track already in the queue from its place, and isn't offered for a track with nothing to play ([#852](https://github.com/RiffPress/RiffPress/issues/852)) ([bd4b11a](https://github.com/RiffPress/RiffPress/commit/bd4b11af0d8e0a129102301d0465d92a65cb3890))

## 0.1.0 (2026-11-02)


### Features

* **player:** Now Playing is a view at a time and the bar's controls and views are registered on the server; Lyrics, Sing and Chords are views, Up next and Together are panels, and the tabs are gone ([#794](https://github.com/RiffPress/RiffPress/issues/794)) ([8e083ce](https://github.com/RiffPress/RiffPress/commit/8e083ced4ea929ad4bf9005598e6a1edcdc34d2c))
* Riff Chords, a chord chart that follows the song, with practice controls to slow it down, loop a part, transpose and set a capo ([#787](https://github.com/RiffPress/RiffPress/issues/787)) ([1d0f16b](https://github.com/RiffPress/RiffPress/commit/1d0f16ba519ed5c1486bb9cd8d05e26c535b7243))


### Bug Fixes

* **chords:** the chart's meta is registered on init, so WordPress no longer warns that Riff Chords loads its translations too early ([#789](https://github.com/RiffPress/RiffPress/issues/789)) ([a908ae0](https://github.com/RiffPress/RiffPress/commit/a908ae0632ec98c657d25da62bdf1f29c99e61be))

## 0.1.0

### Features

* Riff Chords: a chord chart that follows the song, with its fingerings, and practice controls to slow it down, loop a part, transpose and set a capo.
