# Changelog

## [0.7.2](https://github.com/RiffPress/RiffPress/compare/riff-sign-in-v0.7.1...riff-sign-in-v0.7.2) (2026-11-13)


### Bug Fixes

* **listen:** a view change animates only the view, the app's fonts draw once, and the account menu, install card and Sign In sheet take the app's tokens ([#1095](https://github.com/RiffPress/RiffPress/issues/1095)) ([657630d](https://github.com/RiffPress/RiffPress/commit/657630d46a2081bbb0e9eb9056cd5255e4dedb6e))

## [0.7.1](https://github.com/RiffPress/RiffPress/compare/riff-sign-in-v0.7.0...riff-sign-in-v0.7.1) (2026-11-13)


### Bug Fixes

* two saves at once both keep, a sign-in link gets through a private site's gate, and a release with nothing downstream is not red ([#1093](https://github.com/RiffPress/RiffPress/issues/1093)) ([cd81bad](https://github.com/RiffPress/RiffPress/commit/cd81badf5829239d42b8ec6f983109d5972578fd))

## [0.7.0](https://github.com/RiffPress/RiffPress/compare/riff-sign-in-v0.6.1...riff-sign-in-v0.7.0) (2026-11-13)


### Features

* **riff-sign-in:** a host may keep passkeys across subdomains by setting a parent domain as the relying party ID, through riff_sign_in_rp_id ([#1086](https://github.com/RiffPress/RiffPress/issues/1086)) ([9e4896a](https://github.com/RiffPress/RiffPress/commit/9e4896a13db2ffb15d783611e3ffab1084ca69e2))

## [0.6.1](https://github.com/RiffPress/RiffPress/compare/riff-sign-in-v0.6.0...riff-sign-in-v0.6.1) (2026-11-12)


### Bug Fixes

* **riff-sign-in:** signing in takes JSON from the site's own pages, the email link names its account, and nothing answers differently for a member ([#1083](https://github.com/RiffPress/RiffPress/issues/1083)) ([73312d7](https://github.com/RiffPress/RiffPress/commit/73312d70e0a437a6fbcd0dbdffdc72c1825951f6))

## [0.6.0](https://github.com/RiffPress/RiffPress/compare/riff-sign-in-v0.5.1...riff-sign-in-v0.6.0) (2026-11-10)


### Features

* **riff-sign-in:** a local site raises the code request limits a hundredfold, through riff_sign_in_limits ([#1004](https://github.com/RiffPress/RiffPress/issues/1004)) ([b0d4be2](https://github.com/RiffPress/RiffPress/commit/b0d4be2679468f02fd0edf3e06925437f4df381c))


### Bug Fixes

* **riff-sign-in:** removing a passkey on the profile moves focus on and says so ([#1003](https://github.com/RiffPress/RiffPress/issues/1003)) ([48ad2af](https://github.com/RiffPress/RiffPress/commit/48ad2af5bf447bf4b328696d60ca8b77ef3cf123))

## [0.5.1](https://github.com/RiffPress/RiffPress/compare/riff-sign-in-v0.5.0...riff-sign-in-v0.5.1) (2026-11-09)


### Bug Fixes

* **sign-in:** each sign-in attempt is counted in one step ([#995](https://github.com/RiffPress/RiffPress/issues/995)) ([00a6f53](https://github.com/RiffPress/RiffPress/commit/00a6f53666f40c1217efae140b737971040120d4))

## [0.5.0](https://github.com/RiffPress/RiffPress/compare/riff-sign-in-v0.4.3...riff-sign-in-v0.5.0) (2026-11-08)


### Features

* each plugin declares what it needs in isolation.json, and CI fails code that reaches past it ([#954](https://github.com/RiffPress/RiffPress/issues/954)) ([2f8ba39](https://github.com/RiffPress/RiffPress/commit/2f8ba39bfaaa3bfb2cf2fc445f84b737c691b888))

## [0.4.3](https://github.com/RiffPress/RiffPress/compare/riff-sign-in-v0.4.2...riff-sign-in-v0.4.3) (2026-11-08)


### Bug Fixes

* **sign-in:** the link in the email asks before it signs in, so a mail scanner that opens it no longer uses up the code ([#938](https://github.com/RiffPress/RiffPress/issues/938)) ([78988d9](https://github.com/RiffPress/RiffPress/commit/78988d99ccbefe035de1c16e1e6c31270b9c47c0))

## [0.4.2](https://github.com/RiffPress/RiffPress/compare/riff-sign-in-v0.4.1...riff-sign-in-v0.4.2) (2026-11-05)


### Bug Fixes

* **build:** an extension's text domain stops at the end of its main file, so phpcs never holds Riff's own files to it ([#896](https://github.com/RiffPress/RiffPress/issues/896)) ([95b1aa3](https://github.com/RiffPress/RiffPress/commit/95b1aa34b3149be0c5361559a2eff2439b3a95a2))

## [0.4.1](https://github.com/RiffPress/RiffPress/compare/riff-sign-in-v0.4.0...riff-sign-in-v0.4.1) (2026-11-02)


### Bug Fixes

* **sign-in:** the PHP suite runs to its end, and Site Health on a network no longer mistakes WordPress's own mail tidying for a mail service ([#766](https://github.com/RiffPress/RiffPress/issues/766)) ([b8c1fd6](https://github.com/RiffPress/RiffPress/commit/b8c1fd6199daf48a5c7ec156d0279f3ab62a16e3))

## [0.4.0](https://github.com/RiffPress/RiffPress/compare/riff-sign-in-v0.3.0...riff-sign-in-v0.4.0) (2026-10-30)


### Features

* **sign-in:** listeners can stay in the player, with their profile but no dashboard, toolbar or wp-login.php registration form ([#752](https://github.com/RiffPress/RiffPress/issues/752)) ([23fb7a6](https://github.com/RiffPress/RiffPress/commit/23fb7a6b06ea2b46622ac9cba6630978c09dff0b))

## [0.3.0](https://github.com/RiffPress/RiffPress/compare/riff-sign-in-v0.2.0...riff-sign-in-v0.3.0) (2026-10-29)


### Features

* Riff, Riff Lyrics and Riff Sign In need WordPress 7.1, and on 7.2 Riff's fields also show in the Media Library's new views ([#734](https://github.com/RiffPress/RiffPress/issues/734)) ([2d795af](https://github.com/RiffPress/RiffPress/commit/2d795af263bfdda48427ad1cc6a97ac32215d33c))

## [0.2.0](https://github.com/RiffPress/RiffPress/compare/riff-sign-in-v0.1.1...riff-sign-in-v0.2.0) (2026-10-25)


### Features

* **extensions:** Riff Lyrics and Riff Sign In say which Riff they need, Requires Riff in their headers, stay out of the way on an older one, and CI holds each to the hooks it uses ([#659](https://github.com/RiffPress/RiffPress/issues/659)) ([f7e5f0e](https://github.com/RiffPress/RiffPress/commit/f7e5f0e7870cde87b8c6d09bfc8cd26c5a854914))

## [0.1.1](https://github.com/RiffPress/RiffPress/compare/riff-sign-in-v0.1.0...riff-sign-in-v0.1.1) (2026-10-25)


### Bug Fixes

* **sign-in:** the sheet takes Riff's tokens from the player, so it is drawn in the player's surface, font and amber in the installed app and on every other page, with a visible field, a filled Continue and a close button in its corner ([#638](https://github.com/RiffPress/RiffPress/issues/638)) ([f04e91d](https://github.com/RiffPress/RiffPress/commit/f04e91d5877055ff9598ea02dad06b049b5c67c0))

## 0.1.0 (2026-10-25)


### Features

* Riff Sign In: listeners sign in with a passkey or an email code, from a sheet inside the player ([#616](https://github.com/RiffPress/RiffPress/issues/616)) ([a9f896c](https://github.com/RiffPress/RiffPress/commit/a9f896ca9fb56ac98e5239a0c14a11c25f296830))

## 0.1.0

### Features

* Riff Sign In: passkeys and email codes for listeners, in a sheet inside the player.
