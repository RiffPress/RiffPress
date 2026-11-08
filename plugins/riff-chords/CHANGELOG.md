# Changelog

## [0.7.0](https://github.com/RiffPress/RiffPress/compare/riff-chords-v0.6.0...riff-chords-v0.7.0) (2026-11-08)


### Features

* each plugin declares what it needs in isolation.json, and CI fails code that reaches past it ([#954](https://github.com/RiffPress/RiffPress/issues/954)) ([2f8ba39](https://github.com/RiffPress/RiffPress/commit/2f8ba39bfaaa3bfb2cf2fc445f84b737c691b888))
* experimental sandbox runs an untrusted extension's PHP in php-wasm, behind a bridge that grants only its manifest ([#957](https://github.com/RiffPress/RiffPress/issues/957)) ([0bcd173](https://github.com/RiffPress/RiffPress/commit/0bcd1735b1aa6330870a01ab8a0ad6facaa653c9))
* **player:** the accent comes from the cover playing, muted to read on black, and the site's accent stands in for a grey one ([#952](https://github.com/RiffPress/RiffPress/issues/952)) ([557e798](https://github.com/RiffPress/RiffPress/commit/557e7989ed069c6dfbc2fd5ffd337473e3787723))
* **riff:** abilities for an owner and an assistant, offered over MCP through the MCP Adapter once the site turns it on ([#959](https://github.com/RiffPress/RiffPress/issues/959)) ([3feed2b](https://github.com/RiffPress/RiffPress/commit/3feed2b205941b27320d261d7154faf94f497fb7))
* **riff:** typed SDK generated from the code, and a post's blocks as a typed tree over REST ([#960](https://github.com/RiffPress/RiffPress/issues/960)) ([038924f](https://github.com/RiffPress/RiffPress/commit/038924fe661889ef32ca305709f7169651a6d8db))


### Bug Fixes

* main's checks pass again after the drafts merged untested, each plugin declaring what they added and About crediting only a caption a file has ([#962](https://github.com/RiffPress/RiffPress/issues/962)) ([708dfac](https://github.com/RiffPress/RiffPress/commit/708dfac72716ed9483fb80dd127ce181c9643db1))

## [0.6.0](https://github.com/RiffPress/RiffPress/compare/riff-chords-v0.5.0...riff-chords-v0.6.0) (2026-11-07)


### Features

* **meters:** the VU meter and spectrum move to an experimental plugin, in a place Riff keeps under the turntable ([#927](https://github.com/RiffPress/RiffPress/issues/927)) ([3dd4c50](https://github.com/RiffPress/RiffPress/commit/3dd4c50de38d474a98d7a836de4277fe28bc7b17))

## [0.5.0](https://github.com/RiffPress/RiffPress/compare/riff-chords-v0.4.1...riff-chords-v0.5.0) (2026-11-07)


### Features

* **player:** Riff's icons are WordPress's own, with the few it lacks drawn to match ([#909](https://github.com/RiffPress/RiffPress/issues/909)) ([69e11e1](https://github.com/RiffPress/RiffPress/commit/69e11e1a96dd96b58d6951391900c4172dabdb1e))

## [0.4.1](https://github.com/RiffPress/RiffPress/compare/riff-chords-v0.4.0...riff-chords-v0.4.1) (2026-11-05)


### Bug Fixes

* **build:** an extension's text domain stops at the end of its main file, so phpcs never holds Riff's own files to it ([#896](https://github.com/RiffPress/RiffPress/issues/896)) ([95b1aa3](https://github.com/RiffPress/RiffPress/commit/95b1aa34b3149be0c5361559a2eff2439b3a95a2))
* **player:** a press on the bar opens Now Playing, and the album's button in the bar is gone ([#883](https://github.com/RiffPress/RiffPress/issues/883)) ([c481e78](https://github.com/RiffPress/RiffPress/commit/c481e788feca572ad853d7f35267ac085b51ad71))
* **player:** a tap, a long-press or a double-click on a button never selects its label, while rows, lyrics and chord charts still select ([#882](https://github.com/RiffPress/RiffPress/issues/882)) ([d5f6606](https://github.com/RiffPress/RiffPress/commit/d5f660666f52be3f209e4235ce839db8a4ee7802))

## [0.4.0](https://github.com/RiffPress/RiffPress/compare/riff-chords-v0.3.1...riff-chords-v0.4.0) (2026-11-04)


### Features

* **player:** Now Playing's album is the cover where it is upright and the turntable where it is wide, one view with one button ([#875](https://github.com/RiffPress/RiffPress/issues/875)) ([d07506d](https://github.com/RiffPress/RiffPress/commit/d07506d2dbb6529fd46a2674e3fd64dc5102e407))

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
