# Changelog

## [0.4.0](https://github.com/RiffPress/RiffPress/compare/riff-sing-v0.3.1...riff-sing-v0.4.0) (2026-11-04)


### Features

* **player:** Now Playing's album is the cover where it is upright and the turntable where it is wide, one view with one button ([#875](https://github.com/RiffPress/RiffPress/issues/875)) ([d07506d](https://github.com/RiffPress/RiffPress/commit/d07506d2dbb6529fd46a2674e3fd64dc5102e407))

## [0.3.1](https://github.com/RiffPress/RiffPress/compare/riff-sing-v0.3.0...riff-sing-v0.3.1) (2026-11-03)


### Bug Fixes

* **player:** a view's button shows only for a track it has something for, and an open view gives way to one without ([#873](https://github.com/RiffPress/RiffPress/issues/873)) ([33d83b2](https://github.com/RiffPress/RiffPress/commit/33d83b2bb1e4b34d06ce488e03e3a214d06fa6c5))

## [0.3.0](https://github.com/RiffPress/RiffPress/compare/riff-sing-v0.2.0...riff-sing-v0.3.0) (2026-11-03)


### Features

* **sing:** a track with Riff Lyrics' timed lyrics shows its words under the lane at Riff Lyrics' times ([#855](https://github.com/RiffPress/RiffPress/issues/855)) ([e5ac358](https://github.com/RiffPress/RiffPress/commit/e5ac3588d9195112c0f810f1568bd20c9ad27fc1))


### Bug Fixes

* **sing:** through a break the lyrics mark, the next line waits under the lane, and lyrics whose file tag starts with a blank line are still read as timed ([#857](https://github.com/RiffPress/RiffPress/issues/857)) ([404a7a1](https://github.com/RiffPress/RiffPress/commit/404a7a14c57fa3bdf45111e4f599624d7a11df51))

## [0.2.0](https://github.com/RiffPress/RiffPress/compare/riff-sing-v0.1.0...riff-sing-v0.2.0) (2026-11-03)


### Features

* **sing:** an UltraStar chart written in relative beats (#RELATIVE:yes) is read, each line counted from where the break before it says ([#830](https://github.com/RiffPress/RiffPress/issues/830)) ([296a1f1](https://github.com/RiffPress/RiffPress/commit/296a1f1086fae640f83ad4f444dad5cd73582cc7))
* **sing:** an UltraStar duet sings in two lanes, each singer scored on their own from a microphone or a MIDI input of their own ([#842](https://github.com/RiffPress/RiffPress/issues/842)) ([8f12142](https://github.com/RiffPress/RiffPress/commit/8f12142ebeddbc512d5c809204d9ed3163cf7623))
* **sing:** the melody can be a MIDI file's vocal track, named in the audio file's Melody file field, so a chart can come from a score ([#836](https://github.com/RiffPress/RiffPress/issues/836)) ([f79e280](https://github.com/RiffPress/RiffPress/commit/f79e280e89ca8ae152c1c0890ccd0775b4d5e9c3))


### Bug Fixes

* **sing:** a #GAP after a blank line among a chart's headers is read, so the melody starts where it says ([#837](https://github.com/RiffPress/RiffPress/issues/837)) ([181728c](https://github.com/RiffPress/RiffPress/commit/181728c2775492346d06aad697dcad68c83acd1e))

## 0.1.0 (2026-11-02)


### Features

* **player:** Now Playing is a view at a time and the bar's controls and views are registered on the server; Lyrics, Sing and Chords are views, Up next and Together are panels, and the tabs are gone ([#794](https://github.com/RiffPress/RiffPress/issues/794)) ([8e083ce](https://github.com/RiffPress/RiffPress/commit/8e083ced4ea929ad4bf9005598e6a1edcdc34d2c))
* Riff Sing: sing along with the melody in Now Playing, scored by pitch from a microphone or a MIDI instrument ([#788](https://github.com/RiffPress/RiffPress/issues/788)) ([a649855](https://github.com/RiffPress/RiffPress/commit/a649855959bd3717ff7b0a7144ca9caa9b3eeb28))

## 0.1.0

### Features

* Riff Sing: a Sing tab beside Up next, where the melody scrolls past and each line is scored by how close the singer comes, from a microphone or a MIDI instrument.
