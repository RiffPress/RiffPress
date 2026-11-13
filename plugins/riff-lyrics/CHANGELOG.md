# Changelog

## [1.9.3](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v1.9.2...riff-lyrics-v1.9.3) (2026-11-13)


### Bug Fixes

* main's versions agree with the release manifest again ([#1104](https://github.com/RiffPress/RiffPress/issues/1104)) ([01ef6fd](https://github.com/RiffPress/RiffPress/commit/01ef6fd72b42ce5bf548be3f175fef68c77473e9))

## [1.9.2](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v1.9.1...riff-lyrics-v1.9.2) (2026-11-13)


### Bug Fixes

* CI is green again: the Rights meta test registers its keys, the albums route asks once whether any music has an end, and the tests expect the renamed Together and account menu ([#1097](https://github.com/RiffPress/RiffPress/issues/1097)) ([50fefed](https://github.com/RiffPress/RiffPress/commit/50fefed6527db7706c6140a6613eb1f372b7cc1e))

## [1.9.1](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v1.9.0...riff-lyrics-v1.9.1) (2026-11-13)


### Bug Fixes

* two saves at once both keep, a sign-in link gets through a private site's gate, and a release with nothing downstream is not red ([#1093](https://github.com/RiffPress/RiffPress/issues/1093)) ([cd81bad](https://github.com/RiffPress/RiffPress/commit/cd81badf5829239d42b8ec6f983109d5972578fd))

## [1.9.0](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v1.8.0...riff-lyrics-v1.9.0) (2026-11-08)


### Features

* each plugin declares what it needs in isolation.json, and CI fails code that reaches past it ([#954](https://github.com/RiffPress/RiffPress/issues/954)) ([2f8ba39](https://github.com/RiffPress/RiffPress/commit/2f8ba39bfaaa3bfb2cf2fc445f84b737c691b888))
* experimental sandbox runs an untrusted extension's PHP in php-wasm, behind a bridge that grants only its manifest ([#957](https://github.com/RiffPress/RiffPress/issues/957)) ([0bcd173](https://github.com/RiffPress/RiffPress/commit/0bcd1735b1aa6330870a01ab8a0ad6facaa653c9))
* **player:** the accent comes from the cover playing, muted to read on black, and the site's accent stands in for a grey one ([#952](https://github.com/RiffPress/RiffPress/issues/952)) ([557e798](https://github.com/RiffPress/RiffPress/commit/557e7989ed069c6dfbc2fd5ffd337473e3787723))
* **riff:** abilities for an owner and an assistant, offered over MCP through the MCP Adapter once the site turns it on ([#959](https://github.com/RiffPress/RiffPress/issues/959)) ([3feed2b](https://github.com/RiffPress/RiffPress/commit/3feed2b205941b27320d261d7154faf94f497fb7))
* **riff:** typed SDK generated from the code, and a post's blocks as a typed tree over REST ([#960](https://github.com/RiffPress/RiffPress/issues/960)) ([038924f](https://github.com/RiffPress/RiffPress/commit/038924fe661889ef32ca305709f7169651a6d8db))


### Bug Fixes

* main's checks pass again after the drafts merged untested, each plugin declaring what they added and About crediting only a caption a file has ([#962](https://github.com/RiffPress/RiffPress/issues/962)) ([708dfac](https://github.com/RiffPress/RiffPress/commit/708dfac72716ed9483fb80dd127ce181c9643db1))

## [1.8.0](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v1.7.1...riff-lyrics-v1.8.0) (2026-11-07)


### Features

* **player:** Riff's icons are WordPress's own, with the few it lacks drawn to match ([#909](https://github.com/RiffPress/RiffPress/issues/909)) ([69e11e1](https://github.com/RiffPress/RiffPress/commit/69e11e1a96dd96b58d6951391900c4172dabdb1e))

## [1.7.1](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v1.7.0...riff-lyrics-v1.7.1) (2026-11-05)


### Bug Fixes

* **build:** an extension's text domain stops at the end of its main file, so phpcs never holds Riff's own files to it ([#896](https://github.com/RiffPress/RiffPress/issues/896)) ([95b1aa3](https://github.com/RiffPress/RiffPress/commit/95b1aa34b3149be0c5361559a2eff2439b3a95a2))
* **player:** a press on the bar opens Now Playing, and the album's button in the bar is gone ([#883](https://github.com/RiffPress/RiffPress/issues/883)) ([c481e78](https://github.com/RiffPress/RiffPress/commit/c481e788feca572ad853d7f35267ac085b51ad71))
* **player:** a tap, a long-press or a double-click on a button never selects its label, while rows, lyrics and chord charts still select ([#882](https://github.com/RiffPress/RiffPress/issues/882)) ([d5f6606](https://github.com/RiffPress/RiffPress/commit/d5f660666f52be3f209e4235ce839db8a4ee7802))

## [1.7.0](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v1.6.1...riff-lyrics-v1.7.0) (2026-11-04)


### Features

* **player:** Now Playing's album is the cover where it is upright and the turntable where it is wide, one view with one button ([#875](https://github.com/RiffPress/RiffPress/issues/875)) ([d07506d](https://github.com/RiffPress/RiffPress/commit/d07506d2dbb6529fd46a2674e3fd64dc5102e407))

## [1.6.1](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v1.6.0...riff-lyrics-v1.6.1) (2026-11-03)


### Bug Fixes

* **player:** a view's button shows only for a track it has something for, and an open view gives way to one without ([#873](https://github.com/RiffPress/RiffPress/issues/873)) ([33d83b2](https://github.com/RiffPress/RiffPress/commit/33d83b2bb1e4b34d06ce488e03e3a214d06fa6c5))

## [1.6.0](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v1.5.0...riff-lyrics-v1.6.0) (2026-11-03)


### Features

* **sing:** a track with Riff Lyrics' timed lyrics shows its words under the lane at Riff Lyrics' times ([#855](https://github.com/RiffPress/RiffPress/issues/855)) ([e5ac358](https://github.com/RiffPress/RiffPress/commit/e5ac3588d9195112c0f810f1568bd20c9ad27fc1))


### Bug Fixes

* **sing:** through a break the lyrics mark, the next line waits under the lane, and lyrics whose file tag starts with a blank line are still read as timed ([#857](https://github.com/RiffPress/RiffPress/issues/857)) ([404a7a1](https://github.com/RiffPress/RiffPress/commit/404a7a14c57fa3bdf45111e4f599624d7a11df51))

## [1.5.0](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v1.4.0...riff-lyrics-v1.5.0) (2026-11-02)


### Features

* **extensions:** Riff ships the plugins its manifest names inside itself, each turned on or off from Settings › Riff ([#770](https://github.com/RiffPress/RiffPress/issues/770)) ([cccbfe6](https://github.com/RiffPress/RiffPress/commit/cccbfe6d573997ddcf4e5d5a461382b3cf42934b))
* **player:** Now Playing is a view at a time and the bar's controls and views are registered on the server; Lyrics, Sing and Chords are views, Up next and Together are panels, and the tabs are gone ([#794](https://github.com/RiffPress/RiffPress/issues/794)) ([8e083ce](https://github.com/RiffPress/RiffPress/commit/8e083ced4ea929ad4bf9005598e6a1edcdc34d2c))

## [1.4.0](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v1.3.0...riff-lyrics-v1.4.0) (2026-10-29)


### Features

* Riff, Riff Lyrics and Riff Sign In need WordPress 7.1, and on 7.2 Riff's fields also show in the Media Library's new views ([#734](https://github.com/RiffPress/RiffPress/issues/734)) ([2d795af](https://github.com/RiffPress/RiffPress/commit/2d795af263bfdda48427ad1cc6a97ac32215d33c))

## [1.3.0](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v1.2.0...riff-lyrics-v1.3.0) (2026-10-26)


### Features

* **player:** Now Playing is a record in its sleeve, cut to the album's tracks and turned at 33⅓, its tonearm tracking the album, and the Albums view can stand as a shelf ([#694](https://github.com/RiffPress/RiffPress/issues/694)) ([dda424b](https://github.com/RiffPress/RiffPress/commit/dda424b8818e44806d109ef1dd62cd3a22310658))

## [1.2.0](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v1.1.1...riff-lyrics-v1.2.0) (2026-10-25)


### Features

* **extensions:** Riff Lyrics and Riff Sign In say which Riff they need, Requires Riff in their headers, stay out of the way on an older one, and CI holds each to the hooks it uses ([#659](https://github.com/RiffPress/RiffPress/issues/659)) ([f7e5f0e](https://github.com/RiffPress/RiffPress/commit/f7e5f0e7870cde87b8c6d09bfc8cd26c5a854914))

## [1.1.1](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v1.1.0...riff-lyrics-v1.1.1) (2026-10-25)


### Bug Fixes

* **lyrics:** no Show as text switch: the timed lines are already text a screen reader reads as a list ([#657](https://github.com/RiffPress/RiffPress/issues/657)) ([d4156a4](https://github.com/RiffPress/RiffPress/commit/d4156a4db5125c5d78ded8fbd55578ad478d8c0d))

## [1.1.0](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v1.0.0...riff-lyrics-v1.1.0) (2026-10-25)


### Features

* **lyrics:** timed lyrics are read in the formats taggers and players write: LRC with its offset, Enhanced LRC with words that light up as they are sung, WebVTT, and a file's own ID3 SYLT frame on upload ([#639](https://github.com/RiffPress/RiffPress/issues/639)) ([14c5ec3](https://github.com/RiffPress/RiffPress/commit/14c5ec3688becefb1676d2f54a1671d7af5fc4d9))

## [1.0.0](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v0.3.0...riff-lyrics-v1.0.0) (2026-10-25)


### ⚠ BREAKING CHANGES

* Riff needs WordPress 7.2, and registers its media fields with the Entity Fields API so the Media Library's views and forms show them ([#613](https://github.com/RiffPress/RiffPress/issues/613))

### Features

* captions for a video version, a cover's alt text, a track's language, and the song's transcript; the site's accessibility statement ([#610](https://github.com/RiffPress/RiffPress/issues/610)) ([fff41d1](https://github.com/RiffPress/RiffPress/commit/fff41d1e9648f0cea0a11bfcd8d9b13a83ab3772))
* Riff needs WordPress 7.2, and registers its media fields with the Entity Fields API so the Media Library's views and forms show them ([#613](https://github.com/RiffPress/RiffPress/issues/613)) ([8a7c980](https://github.com/RiffPress/RiffPress/commit/8a7c980407214bdebeafd06e4a4e85627927e617))

## [0.3.0](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v0.2.0...riff-lyrics-v0.3.0) (2026-10-24)


### Features

* **riff-lyrics:** timed lyrics follow the music, and a tap on a line seeks to it ([#595](https://github.com/RiffPress/RiffPress/issues/595)) ([544f556](https://github.com/RiffPress/RiffPress/commit/544f556576bf43b60ae3e591a9438166b7c01d49))

## [0.2.0](https://github.com/RiffPress/RiffPress/compare/riff-lyrics-v0.1.0...riff-lyrics-v0.2.0) (2026-10-24)


### Features

* Riff's design tokens are one stylesheet, riff-tokens, that its extensions depend on ([#577](https://github.com/RiffPress/RiffPress/issues/577)) ([04799d5](https://github.com/RiffPress/RiffPress/commit/04799d5e2d918bbb76f670c01d0b11fb59b78212))


### Bug Fixes

* signed in, the Listen app and Riff Lyrics ask Riff's and WordPress's routes as the account ([#572](https://github.com/RiffPress/RiffPress/issues/572)) ([3e5d5ba](https://github.com/RiffPress/RiffPress/commit/3e5d5ba7ec405f317b100388f2fe6601de7d4384))

## 0.1.0 (2026-10-20)


### Features

* Riff Lyrics, a Lyrics tab beside Up next, as a plugin built only on Riff's public API ([#388](https://github.com/RiffPress/RiffPress/issues/388)) ([0811809](https://github.com/RiffPress/RiffPress/commit/0811809862fceb70ef058f010959edc964cbfb67))
