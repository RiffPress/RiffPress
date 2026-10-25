# Changelog

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
