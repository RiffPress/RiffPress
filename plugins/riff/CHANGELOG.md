# Changelog

## [4.22.0](https://github.com/RiffPress/RiffPress/compare/v4.21.2...v4.22.0) (2026-10-20)


### Features

* the Listen app shows who is listening, with their picture and a menu, or Sign in ([#488](https://github.com/RiffPress/RiffPress/issues/488)) ([7b98740](https://github.com/RiffPress/RiffPress/commit/7b9874068ae56e05e53a22a3e7851f18d1813928))
* the player's strings are translated in its script modules, from WordPress's script module translations ([#482](https://github.com/RiffPress/RiffPress/issues/482)) ([6bf09e8](https://github.com/RiffPress/RiffPress/commit/6bf09e88859301510575cbb4294e243e954bf13a))


### Bug Fixes

* the order in use in Your Library is underlined, not bolder, so choosing one moves nothing ([#487](https://github.com/RiffPress/RiffPress/issues/487)) ([f20c471](https://github.com/RiffPress/RiffPress/commit/f20c4711bc789c377bf861abc70f57910dbaf13d))
* the player's notices are dark on light with room around them, not white on white ([#486](https://github.com/RiffPress/RiffPress/issues/486)) ([ee41064](https://github.com/RiffPress/RiffPress/commit/ee410641aa522b79b5d01365c1c5050253fc6bf3))
* the seek bar moves on the compositor, so it glides without shaking whatever the page is doing ([#489](https://github.com/RiffPress/RiffPress/issues/489)) ([0f67307](https://github.com/RiffPress/RiffPress/commit/0f67307f02d653157de5bf4d5974c36be64a24c0))
* the seek line stays under the pointer while it is dragged, instead of shaking back to the time playing ([#485](https://github.com/RiffPress/RiffPress/issues/485)) ([d2ebb8f](https://github.com/RiffPress/RiffPress/commit/d2ebb8fbc643b91ff7cb40e53c69bd22d76ab8c0))
* under a block theme, standalone mode has one title and keeps the iPhone safe areas ([#476](https://github.com/RiffPress/RiffPress/issues/476)) ([428da35](https://github.com/RiffPress/RiffPress/commit/428da3569e1d161f70e08bb5d5b5d279a8d654c7))

## [4.21.2](https://github.com/RiffPress/RiffPress/compare/v4.21.1...v4.21.2) (2026-10-20)


### Bug Fixes

* a name that is one long word wraps instead of widening the Listen page ([#469](https://github.com/RiffPress/RiffPress/issues/469)) ([b9f0e39](https://github.com/RiffPress/RiffPress/commit/b9f0e39436114d82dc8e3b7490453bd3a6ab6d54))
* a one-word name wraps inside its card in every row, not only on album pages ([#473](https://github.com/RiffPress/RiffPress/issues/473)) ([ff2e6a7](https://github.com/RiffPress/RiffPress/commit/ff2e6a7f1777ccf18fca0e75eb426d2ea064a365))
* an album of more than 100 tracks lists and plays every track ([#472](https://github.com/RiffPress/RiffPress/issues/472)) ([f74b6b8](https://github.com/RiffPress/RiffPress/commit/f74b6b85ab2ca660f15137154152f811a29e45c7))
* an album of more than 100 tracks plays in track order across its pages ([#468](https://github.com/RiffPress/RiffPress/issues/468)) ([fc0d61c](https://github.com/RiffPress/RiffPress/commit/fc0d61c0f14f44c6df74ae43013fb2548065df3b))
* an empty Posts view tells visitors only that there is nothing to play yet ([#474](https://github.com/RiffPress/RiffPress/issues/474)) ([f345e42](https://github.com/RiffPress/RiffPress/commit/f345e42ee8deea97d17245c27dac6e173f72205a))
* before the first upload, visitors to the Listen page are not told how to add music ([#470](https://github.com/RiffPress/RiffPress/issues/470)) ([62aa776](https://github.com/RiffPress/RiffPress/commit/62aa776cbe25a05feee60986426e4ba5e4876e9d))

## [4.21.1](https://github.com/RiffPress/RiffPress/compare/v4.21.0...v4.21.1) (2026-10-20)


### Bug Fixes

* the Listen app loads without moving ([#465](https://github.com/RiffPress/RiffPress/issues/465)) ([efeef53](https://github.com/RiffPress/RiffPress/commit/efeef530783adb2b13d37a5f384e3ddeb43d90ae))

## [4.21.0](https://github.com/RiffPress/RiffPress/compare/v4.20.0...v4.21.0) (2026-10-19)


### Features

* first run creates the Listen page and points to the first album ([#457](https://github.com/RiffPress/RiffPress/issues/457)) ([cf401c4](https://github.com/RiffPress/RiffPress/commit/cf401c4270fcd4afd1ca6a3e8375221295977fd8))


### Bug Fixes

* every album card's line is its artist, from one shared card ([#461](https://github.com/RiffPress/RiffPress/issues/461)) ([93a1418](https://github.com/RiffPress/RiffPress/commit/93a14184f2516e5c82edf97f830902372f30c63c))
* on a wide screen the seek line sits under the controls, where it is easy to reach ([#466](https://github.com/RiffPress/RiffPress/issues/466)) ([2850ec3](https://github.com/RiffPress/RiffPress/commit/2850ec361a7c26c20ee1208914ffc73d2cb81838))
* security review fixes before the plugin directory ([#463](https://github.com/RiffPress/RiffPress/issues/463)) ([abd37fb](https://github.com/RiffPress/RiffPress/commit/abd37fbb938e5ebf27831fe2c0a34a053412dac2))

## [4.20.0](https://github.com/RiffPress/RiffPress/compare/v4.19.0...v4.20.0) (2026-10-19)


### Features

* likes and Your Library ([#426](https://github.com/RiffPress/RiffPress/issues/426)) ([68fc952](https://github.com/RiffPress/RiffPress/commit/68fc952076a7f815b8cf3a60d7d173fe849d05c4))
* playlists listeners make ([#437](https://github.com/RiffPress/RiffPress/issues/437)) ([1a4fc2c](https://github.com/RiffPress/RiffPress/commit/1a4fc2c95dbe521fb84c331f3c8c07d94464cc16))
* wp-api-coverage, a report of the WordPress APIs a plugin uses and the ones it doesn't yet ([#433](https://github.com/RiffPress/RiffPress/issues/433)) ([b5bc7cb](https://github.com/RiffPress/RiffPress/commit/b5bc7cbd96626ad13d65f16e361e61f3a539832a))


### Bug Fixes

* one heart icon, tidy rows of cards, and a Library that never looks empty ([#434](https://github.com/RiffPress/RiffPress/issues/434)) ([9c41e5a](https://github.com/RiffPress/RiffPress/commit/9c41e5a2c71bf15d9c53740db511ec12cd0f25a9))

## [4.19.0](https://github.com/RiffPress/RiffPress/compare/v4.18.0...v4.19.0) (2026-10-18)


### Features

* a menu on every track to play it next or add it to the queue, and an Up next you can reorder and clear ([#424](https://github.com/RiffPress/RiffPress/issues/424)) ([b923f41](https://github.com/RiffPress/RiffPress/commit/b923f41e31bea06ffc742bd59a9c18950cd6b344))
* an artist page with their picture, their latest tracks and their albums ([#419](https://github.com/RiffPress/RiffPress/issues/419)) ([e4718b9](https://github.com/RiffPress/RiffPress/commit/e4718b9c6f962ec641ba60f568feeb91ef00ceb1))
* search answers as you type, with a top result and recent searches ([#423](https://github.com/RiffPress/RiffPress/issues/423)) ([349f9ce](https://github.com/RiffPress/RiffPress/commit/349f9cee7191e7901c33b0a465e9412ffdf8997e))

## [4.18.0](https://github.com/RiffPress/RiffPress/compare/v4.17.0...v4.18.0) (2026-10-18)


### Features

* an album page tinted from its cover, with more by its artist ([#415](https://github.com/RiffPress/RiffPress/issues/415)) ([bcbf90a](https://github.com/RiffPress/RiffPress/commit/bcbf90a0014aff48951351ef36d7b96b8bd9e20b))
* Home opens the Listen page, with rows of what was played, recently added albums, artists and new posts ([#417](https://github.com/RiffPress/RiffPress/issues/417)) ([c84643b](https://github.com/RiffPress/RiffPress/commit/c84643b1b16a7faf533bd1286c4235467e0c8678))
* protected files, served through WordPress to whoever may play them ([#411](https://github.com/RiffPress/RiffPress/issues/411)) ([9cf19f8](https://github.com/RiffPress/RiffPress/commit/9cf19f8357ea1fd2e4fc125c962f4d24002ecc19))
* the Riff block takes the Site Editor's colour, type, spacing and border settings through to every view inside it ([#413](https://github.com/RiffPress/RiffPress/issues/413)) ([49ad4f9](https://github.com/RiffPress/RiffPress/commit/49ad4f9b1dfc94dffcfd916efd8c93ce52fceff9))


### Bug Fixes

* a playlist post shows each track once when core's block styles print after Riff's ([#408](https://github.com/RiffPress/RiffPress/issues/408)) ([ee36a93](https://github.com/RiffPress/RiffPress/commit/ee36a9354e75c9b3dcd3d9e0629628840835b80a))
* a press on the app's buttons before its script has loaded is held and made once it has ([#416](https://github.com/RiffPress/RiffPress/issues/416)) ([21fbaac](https://github.com/RiffPress/RiffPress/commit/21fbaacb59302163c5435c2cf049c9552b1f272f))
* the sidebar's toggle shows once the script that runs it has loaded ([#409](https://github.com/RiffPress/RiffPress/issues/409)) ([a7d8831](https://github.com/RiffPress/RiffPress/commit/a7d88314fc911f56c8e53d7042759f933ed1e4a0))

## [4.17.0](https://github.com/RiffPress/RiffPress/compare/v4.16.0...v4.17.0) (2026-10-18)


### Features

* riff_can_play locks a track for a visitor, so membership and store plugins can gate music ([#407](https://github.com/RiffPress/RiffPress/issues/407)) ([dce0e18](https://github.com/RiffPress/RiffPress/commit/dce0e18dc2c8efccf0d5285fddee8d2c68f32d97))
* standalone mode has a sidebar on a wide screen, and each row shows its own album's cover ([#393](https://github.com/RiffPress/RiffPress/issues/393)) ([6a4862a](https://github.com/RiffPress/RiffPress/commit/6a4862ab32669ad858bf8a0ecbeee3f63a29a54e))
* standalone mode, the Listen page as an installable player of its own at app/ ([#391](https://github.com/RiffPress/RiffPress/issues/391)) ([08fa295](https://github.com/RiffPress/RiffPress/commit/08fa295d21e6876ba92b2399e2e327f6b46ded58))


### Bug Fixes

* the page stays still behind Now Playing, so only Up next's scrollbar shows ([#402](https://github.com/RiffPress/RiffPress/issues/402)) ([b8d313e](https://github.com/RiffPress/RiffPress/commit/b8d313e2af45af449847d45b7a546f88bd776779))

## [4.16.0](https://github.com/RiffPress/RiffPress/compare/v4.15.0...v4.16.0) (2026-10-18)


### Features

* albums and artists are taxonomies on the Media Library's audio, filed from each file's tags ([#384](https://github.com/RiffPress/RiffPress/issues/384)) ([03773fb](https://github.com/RiffPress/RiffPress/commit/03773fbf15c23c7e683f3b503273ff7b2c0be0d4))
* plugins can add tabs beside Up next in Now Playing ([#383](https://github.com/RiffPress/RiffPress/issues/383)) ([ffabb7b](https://github.com/RiffPress/RiffPress/commit/ffabb7b62a8b82e842af15c54d6fe997a5bc46ca))
* REST routes for tracks, albums and artists from the Media Library, searchable, showing visitors only what is published ([#386](https://github.com/RiffPress/RiffPress/issues/386)) ([8e47d3b](https://github.com/RiffPress/RiffPress/commit/8e47d3b977f5dfb00ea4e4b35d1f21bf53d6036f))
* Riff Lyrics, a Lyrics tab beside Up next, as a plugin built only on Riff's public API ([#388](https://github.com/RiffPress/RiffPress/issues/388)) ([0811809](https://github.com/RiffPress/RiffPress/commit/0811809862fceb70ef058f010959edc964cbfb67))
* the Listen block browses the Media Library by album, artist and track, and searches it ([#387](https://github.com/RiffPress/RiffPress/issues/387)) ([b1f83e8](https://github.com/RiffPress/RiffPress/commit/b1f83e815a11cd938ae068d322b27980b821dd79))
* wp riff import adds a folder of music to the Media Library, one album post per folder ([#378](https://github.com/RiffPress/RiffPress/issues/378)) ([6099ba7](https://github.com/RiffPress/RiffPress/commit/6099ba76a483889e941bb2625369de62179bfef8))

## [4.15.0](https://github.com/RiffPress/RiffPress/compare/v4.14.0...v4.15.0) (2026-10-18)


### Features

* the plugin is Riff Music Player, and its tagline is Own every note ([#377](https://github.com/RiffPress/RiffPress/issues/377)) ([828de07](https://github.com/RiffPress/RiffPress/commit/828de07e80ddbf7329c5b1e8747558de2bab2b10))


### Bug Fixes

* closing Now Playing in Safari returns focus to the bar; WebKit smoke tests and phone-size Listen tests ([#363](https://github.com/RiffPress/RiffPress/issues/363)) ([e9e2443](https://github.com/RiffPress/RiffPress/commit/e9e24439cd54531ad23674c5f5c3e347c6ebe693))

## [4.14.0](https://github.com/RiffPress/RiffPress/compare/v4.13.0...v4.14.0) (2026-10-18)


### Features

* the Riff block takes the theme's colours and fonts ([#357](https://github.com/RiffPress/RiffPress/issues/357)) ([3da8b92](https://github.com/RiffPress/RiffPress/commit/3da8b923c2253a67baa12c1a1feb1f8f9d6b3ae3))


### Bug Fixes

* on a wide screen the seek knob and time are not cut off by Now Playing ([#355](https://github.com/RiffPress/RiffPress/issues/355)) ([08ca68c](https://github.com/RiffPress/RiffPress/commit/08ca68c5fffe47c05190883b340509fa57d8d41a))
* the playing row's bars move with the music on every album, and read on a pale cover ([#359](https://github.com/RiffPress/RiffPress/issues/359)) ([0b75ab1](https://github.com/RiffPress/RiffPress/commit/0b75ab19be57f0178d75351dbc57571afd30de10))
* the seek glow fades out before the knob instead of ending in a square edge ([#358](https://github.com/RiffPress/RiffPress/issues/358)) ([45d6091](https://github.com/RiffPress/RiffPress/commit/45d6091c647b652c07f69bd75f23e848bd0f3226))
* Up next scrolls with a thin dark scrollbar, not the page's light one ([#360](https://github.com/RiffPress/RiffPress/issues/360)) ([28a4804](https://github.com/RiffPress/RiffPress/commit/28a480432d12eebd089c294a87b6f8c2d59d4ecd))

## [4.13.0](https://github.com/RiffPress/RiffPress/compare/v4.12.2...v4.13.0) (2026-10-16)


### Features

* choose a track's artwork and video version from the Media Library ([#350](https://github.com/RiffPress/RiffPress/issues/350)) ([bc920c4](https://github.com/RiffPress/RiffPress/commit/bc920c4c1213329e3cc51ebfd57dae4c581038c3))
* Share links to the track, and the link opens on it without playing ([#353](https://github.com/RiffPress/RiffPress/issues/353)) ([3e1c6eb](https://github.com/RiffPress/RiffPress/commit/3e1c6eb40d798c11859f376907ebc20c91c43544))


### Bug Fixes

* every page of the Listen library is reachable on the first visit and without JavaScript ([#352](https://github.com/RiffPress/RiffPress/issues/352)) ([b1c70ec](https://github.com/RiffPress/RiffPress/commit/b1c70ec1f48f675d38189bd3dee422e51ac9126d))
* Listen says when a cover's Play or Load more could not load ([#351](https://github.com/RiffPress/RiffPress/issues/351)) ([df96b98](https://github.com/RiffPress/RiffPress/commit/df96b9874ba449d1e2238303cd6b980417a901e8))

## [4.12.2](https://github.com/RiffPress/RiffPress/compare/v4.12.1...v4.12.2) (2026-10-15)


### Bug Fixes

* the readme's Contributors line is the wordpress.org username, joefusco ([#338](https://github.com/RiffPress/RiffPress/issues/338)) ([480c968](https://github.com/RiffPress/RiffPress/commit/480c968e90381600f71787d2bb91d7a4455ebe9d))

## [4.12.1](https://github.com/RiffPress/RiffPress/compare/v4.12.0...v4.12.1) (2026-10-14)


### Bug Fixes

* **site:** the Download button is not underlined on its own page ([#337](https://github.com/RiffPress/RiffPress/issues/337)) ([dff893b](https://github.com/RiffPress/RiffPress/commit/dff893b1faa5364cd637d560880a234dda1ea8d4))
* what the developer reference says matches the code ([#334](https://github.com/RiffPress/RiffPress/issues/334)) ([43f178e](https://github.com/RiffPress/RiffPress/commit/43f178e2d8dd9c69c42b26cda1b983b0561103fe))
* WPGraphQL's RiffTrack has every property of the track schema ([#335](https://github.com/RiffPress/RiffPress/issues/335)) ([48ea24f](https://github.com/RiffPress/RiffPress/commit/48ea24f0d5356dc2b8632766df2142c257cdaac0))

## [4.12.0](https://github.com/RiffPress/RiffPress/compare/v4.11.0...v4.12.0) (2026-10-14)


### Features

* a developer reference on the site, generated from the code, one section per language ([#332](https://github.com/RiffPress/RiffPress/issues/332)) ([f89b568](https://github.com/RiffPress/RiffPress/commit/f89b568c30fb4f2d61d625380be11458bd683a4d))

## [4.11.0](https://github.com/RiffPress/RiffPress/compare/v4.10.0...v4.11.0) (2026-10-14)


### Features

* **site:** a second read for writing by rule ([#330](https://github.com/RiffPress/RiffPress/issues/330)) ([1445a1e](https://github.com/RiffPress/RiffPress/commit/1445a1e9b941140cfba6341455c4331975ee2c62))

## [4.10.0](https://github.com/RiffPress/RiffPress/compare/v4.9.0...v4.10.0) (2026-10-14)


### Features

* a lossless track shows its bit depth and sample rate, as WordPress read them from the file ([#321](https://github.com/RiffPress/RiffPress/issues/321)) ([5239781](https://github.com/RiffPress/RiffPress/commit/52397813963b5f000b3ce75fbcdadcde6c6e1649))
* **site:** the copy says what Riff is for, owning your music again, and that it is built to be extended ([#326](https://github.com/RiffPress/RiffPress/issues/326)) ([5be666a](https://github.com/RiffPress/RiffPress/commit/5be666ac244aa839ca541ca81e4dcdd65ca8235d))
* **site:** the demo's nine covers on the site, and the bands warmed with wordpress.org's pomegranate ([#319](https://github.com/RiffPress/RiffPress/issues/319)) ([55df86c](https://github.com/RiffPress/RiffPress/commit/55df86cec957e8a2962a10abde91807e187e4bbb))
* **site:** the guide adds an album with the Playlist block, with screenshots of the demo as it is now ([#329](https://github.com/RiffPress/RiffPress/issues/329)) ([5fdad47](https://github.com/RiffPress/RiffPress/commit/5fdad478e6930acc4c5e3e6eea43b7f95091dad8))
* **site:** wordpress.org's dots between sections, records cropped into the margins, and the cover PNG the ignore rule had kept out ([#323](https://github.com/RiffPress/RiffPress/issues/323)) ([fe86dc0](https://github.com/RiffPress/RiffPress/commit/fe86dc0c0cf74034992d82ec50139330e88a3e19))
* the demo seeds each album as one Playlist block where WordPress has it ([#327](https://github.com/RiffPress/RiffPress/issues/327)) ([7155c66](https://github.com/RiffPress/RiffPress/commit/7155c6650ac41f0b30f7804c2d1ce915b8277376))
* the Riff block previews the library in the editor as it renders on the page ([#324](https://github.com/RiffPress/RiffPress/issues/324)) ([60425b0](https://github.com/RiffPress/RiffPress/commit/60425b05d2b3a465f3ac4f2148456491a0f7701e))


### Bug Fixes

* the bars on the current Up next item follow the music ([#328](https://github.com/RiffPress/RiffPress/issues/328)) ([b161a3f](https://github.com/RiffPress/RiffPress/commit/b161a3fc51ff33766b172952cdc4317a1b9fcaee))

## [4.9.0](https://github.com/RiffPress/RiffPress/compare/v4.8.0...v4.9.0) (2026-10-14)


### Features

* **site:** a download page with the release and its zip, and a header without Live demo ([#317](https://github.com/RiffPress/RiffPress/issues/317)) ([80bb6bf](https://github.com/RiffPress/RiffPress/commit/80bb6bf81ee147b7392da6af81f99e5188db43d7))
* the core Playlist block is a source of tracks, one row per item, with its own player kept off ([#314](https://github.com/RiffPress/RiffPress/issues/314)) ([e95e83c](https://github.com/RiffPress/RiffPress/commit/e95e83c5543921ff2fc7f986ea5482989e2cb982))

## [4.8.0](https://github.com/RiffPress/RiffPress/compare/v4.7.0...v4.8.0) (2026-10-14)


### Features

* **site:** a guide to adding an album, and a header that reaches it and the under-the-hood pages ([#312](https://github.com/RiffPress/RiffPress/issues/312)) ([89ecafa](https://github.com/RiffPress/RiffPress/commit/89ecafa9b67f7b45425f8f8609b3fe3989b693f9))

## [4.7.0](https://github.com/RiffPress/RiffPress/compare/v4.6.0...v4.7.0) (2026-10-14)


### Features

* **site:** a page for every browser API and CSS feature the player uses, linked to the deployed source ([#310](https://github.com/RiffPress/RiffPress/issues/310)) ([3a10d02](https://github.com/RiffPress/RiffPress/commit/3a10d02978cb1d5e8c564ac2f733a5c166293604))

## [4.6.0](https://github.com/RiffPress/RiffPress/compare/v4.5.1...v4.6.0) (2026-10-14)


### Features

* **site:** say why Riff, and set the landing page in wordpress.org's conventions ([#308](https://github.com/RiffPress/RiffPress/issues/308)) ([9cbaeec](https://github.com/RiffPress/RiffPress/commit/9cbaeec0030f20d40c7aaad7ad5d653b8c150b44))

## [4.5.1](https://github.com/RiffPress/RiffPress/compare/v4.5.0...v4.5.1) (2026-10-13)


### Bug Fixes

* a cover's grooves follow the music at half the sway, smoothed, and the demo cover carries its level data ([#302](https://github.com/RiffPress/RiffPress/issues/302)) ([6c5d772](https://github.com/RiffPress/RiffPress/commit/6c5d7721a59f2ff44096f49cebfc96a38ef03d24))
* every cast button follows device availability, two landing page claims are corrected, and a test holds the API list to the code ([#303](https://github.com/RiffPress/RiffPress/issues/303)) ([6595afd](https://github.com/RiffPress/RiffPress/commit/6595afdc50dc9f9cf43dd15371cebeb37ffa28bc))
* the Listen block keeps wordpress.org's content width, with the library grid and the now-playing strip on one edge ([#305](https://github.com/RiffPress/RiffPress/issues/305)) ([5af4773](https://github.com/RiffPress/RiffPress/commit/5af4773d5b548955d3d35604235db395b554f03d))

## [4.5.0](https://github.com/RiffPress/RiffPress/compare/v4.4.0...v4.5.0) (2026-10-13)


### Features

* eight more albums in the demo, streamed from the site, with the music's level data in every cover's grooves ([#298](https://github.com/RiffPress/RiffPress/issues/298)) ([b663ac4](https://github.com/RiffPress/RiffPress/commit/b663ac4b8919fc5ddff5dec983809f90c150c006))
* every drawn cover is the record, one groove per track, in wordpress.org's palette and type ([#296](https://github.com/RiffPress/RiffPress/issues/296)) ([c5423b2](https://github.com/RiffPress/RiffPress/commit/c5423b21523e57c6845769af48e13f3c1c1772a5))

## [4.4.0](https://github.com/RiffPress/RiffPress/compare/v4.3.0...v4.4.0) (2026-10-13)


### Features

* riffpress.com/demo always opens the current demo, so no link has to know the stamp ([#294](https://github.com/RiffPress/RiffPress/issues/294)) ([0a68872](https://github.com/RiffPress/RiffPress/commit/0a68872620a382f158bdbc8431e4e2f3d6acbd76))

## [4.3.0](https://github.com/RiffPress/RiffPress/compare/v4.2.0...v4.3.0) (2026-10-13)


### Features

* a permanent demo on WP Engine, deployed on every release and reset to the seed every night ([#292](https://github.com/RiffPress/RiffPress/issues/292)) ([9527330](https://github.com/RiffPress/RiffPress/commit/95273309166add0ea624827d874ead01e700a57f))


### Bug Fixes

* a drawn cover's byline no longer repeats the artist that sits on the line above ([#287](https://github.com/RiffPress/RiffPress/issues/287)) ([88823fd](https://github.com/RiffPress/RiffPress/commit/88823fd05fdbc234bb2d78cb64a42129a0fdd3d3))
* phone touch targets reach 44px, the Listen block keeps wordpress.org's text weight under any theme, and phones get 1440px desktop shots ([#291](https://github.com/RiffPress/RiffPress/issues/291)) ([b6bed45](https://github.com/RiffPress/RiffPress/commit/b6bed4555749a205ee5954a2ec608a9c71e73f81))
* the demo link carries the commit stamp and the blueprint is never served from a stale cache ([#290](https://github.com/RiffPress/RiffPress/issues/290)) ([2497e2f](https://github.com/RiffPress/RiffPress/commit/2497e2f9cde222913d1d567a67392f62e70fd8be))


### Reverts

* the WP Engine demo workflow, since the demo stays on Playground ([#293](https://github.com/RiffPress/RiffPress/issues/293)) ([96159bc](https://github.com/RiffPress/RiffPress/commit/96159bc8a4697a12fba46f3fec90e0d23a77f819))

## [4.2.0](https://github.com/RiffPress/RiffPress/compare/v4.1.0...v4.2.0) (2026-10-13)


### Features

* a track with a video carries a film mark by its title, in place of the pill on the row's right edge ([#280](https://github.com/RiffPress/RiffPress/issues/280)) ([3bb4f73](https://github.com/RiffPress/RiffPress/commit/3bb4f7300e9450043c9125e0606ff61a6196d1b8))
* the demo and a seeded local site are named Riff and wear the record as their site icon ([#278](https://github.com/RiffPress/RiffPress/issues/278)) ([3714b8c](https://github.com/RiffPress/RiffPress/commit/3714b8c292dc6212f5eef2c00ea4ab0b5a8a7649))
* the demo plays the whole album, seventy minutes, in place of forty-second excerpts ([#279](https://github.com/RiffPress/RiffPress/issues/279)) ([6a058aa](https://github.com/RiffPress/RiffPress/commit/6a058aa9733209ac18f1c86bc1460c6197caceee))
* the seek bar shows what has loaded, the audio graph sleeps when paused, the screen stays on for video, and the page survives the back-forward cache ([#275](https://github.com/RiffPress/RiffPress/issues/275)) ([97cfbb2](https://github.com/RiffPress/RiffPress/commit/97cfbb2fe4358a09f118c2aeabab62148745b67c))


### Bug Fixes

* the skip link sits fully above the page until it is focused ([#281](https://github.com/RiffPress/RiffPress/issues/281)) ([2616762](https://github.com/RiffPress/RiffPress/commit/26167620ab05cddef30118c87969f02266edcfd3))

## [4.1.0](https://github.com/RiffPress/RiffPress/compare/v4.0.1...v4.1.0) (2026-10-13)


### Features

* the playing track shows its format and bit rate in the bar and Now Playing, from what WordPress read on upload ([#270](https://github.com/RiffPress/RiffPress/issues/270)) ([6e44cc5](https://github.com/RiffPress/RiffPress/commit/6e44cc545c0663277e985d36c9c7681f3350e801))


### Bug Fixes

* the bar's end column grows for the quality pill, so the byline no longer runs under it ([#274](https://github.com/RiffPress/RiffPress/issues/274)) ([3648178](https://github.com/RiffPress/RiffPress/commit/3648178be71918e6683d684604ae7baed92ff876))

## [4.0.1](https://github.com/RiffPress/RiffPress/compare/v4.0.0...v4.0.1) (2026-10-13)


### Bug Fixes

* the player is usable by keyboard and screen reader under Now Playing, in right-to-left languages, and with titles in any script ([#268](https://github.com/RiffPress/RiffPress/issues/268)) ([e9b33d0](https://github.com/RiffPress/RiffPress/commit/e9b33d0010e846adc900c6e37ba457ea2c151587))
* the plugin header and readme title read RiffPlayer, which the directory accepts ([#266](https://github.com/RiffPress/RiffPress/issues/266)) ([0913068](https://github.com/RiffPress/RiffPress/commit/09130683b78ee30ca05ced23228ecdf9f640ad5a))

## [4.0.0](https://github.com/RiffPress/RiffPress/compare/v3.0.1...v4.0.0) (2026-10-13)


### ⚠ BREAKING CHANGES

* Riff, a music player for any WordPress site, replaces Callboard ([#239](https://github.com/RiffPress/RiffPress/issues/239))

### Features

* a Listen page template that is the block and nothing else, and the demo lands inside it ([#249](https://github.com/RiffPress/RiffPress/issues/249)) ([b8a1b6b](https://github.com/RiffPress/RiffPress/commit/b8a1b6be81f466e096df4747112564b2604b74a2))
* a public extension surface with a hooks reference, a JavaScript api, sources, a versioned track schema, control regions, and theming ([#247](https://github.com/RiffPress/RiffPress/issues/247)) ([ea2c6c5](https://github.com/RiffPress/RiffPress/commit/ea2c6c597857917fb3be902ee655927d9fc0cdf9))
* Riff, a music player for any WordPress site, replaces Callboard ([#239](https://github.com/RiffPress/RiffPress/issues/239)) ([dc00e8f](https://github.com/RiffPress/RiffPress/commit/dc00e8f17e45b087080744cde4f486c2cd7223df))
* structured data, icons, a new share card, AVIF screenshots, robots, sitemap and a 404 for the landing page ([#253](https://github.com/RiffPress/RiffPress/issues/253)) ([dc47450](https://github.com/RiffPress/RiffPress/commit/dc47450ad2c29256483c791b98803b3a8ade3374))
* the Listen block, a Media Library tracks API, drawn covers, and WordPress.org design ([#240](https://github.com/RiffPress/RiffPress/issues/240)) ([a2c0c4d](https://github.com/RiffPress/RiffPress/commit/a2c0c4d55143c6fb2a02eb7e5c2c919f6fb5d0bd))
* the plugin's author is RiffPress, the organisation behind it ([#256](https://github.com/RiffPress/RiffPress/issues/256)) ([6d7d7eb](https://github.com/RiffPress/RiffPress/commit/6d7d7eb5f4e554ad2454918eed66407f1d2fabc4))


### Bug Fixes

* every Playground link opens in seamless mode, without Playground's own toolbar ([#250](https://github.com/RiffPress/RiffPress/issues/250)) ([ba614ea](https://github.com/RiffPress/RiffPress/commit/ba614eaaf46674282c6e228c71821f23af6411a4))
* name the demo files without commas so raw GitHub can serve them to Playground ([#241](https://github.com/RiffPress/RiffPress/issues/241)) ([757b0a9](https://github.com/RiffPress/RiffPress/commit/757b0a932f334812965d6d4c9abfe4cd35131975))
* password-protected posts stay out of the library, the app works on plain permalinks, and the player restyles less per frame ([#254](https://github.com/RiffPress/RiffPress/issues/254)) ([bd1e7ce](https://github.com/RiffPress/RiffPress/commit/bd1e7ce398bfbe95eb626471f368b23976968bf1))
* Release Please continues from 3.0.1 and releases Riff as 4.0.0 ([#260](https://github.com/RiffPress/RiffPress/issues/260)) ([3c34819](https://github.com/RiffPress/RiffPress/commit/3c34819c2cf47f41ed65b838008eeb6e744e12de))
* the demo reads Written by Riff in Jazz, hides the admin bar, and has a Listen page ([#245](https://github.com/RiffPress/RiffPress/issues/245)) ([9163b43](https://github.com/RiffPress/RiffPress/commit/9163b43c016b67b82741a257053f66a9534fe6de))
* the hero and the nav open the live demo directly instead of scrolling to a second button ([#248](https://github.com/RiffPress/RiffPress/issues/248)) ([60d620c](https://github.com/RiffPress/RiffPress/commit/60d620c17c00b2fb5ff7f261f09fb5cc62aefb5c))
* the hooks reference names the file, not the line, so unrelated edits stop making it stale ([#258](https://github.com/RiffPress/RiffPress/issues/258)) ([54efe0f](https://github.com/RiffPress/RiffPress/commit/54efe0fc0b08d5100d86fb2102aad8e651ddd007))
* the landing page links to the live demo instead of embedding it ([#243](https://github.com/RiffPress/RiffPress/issues/243)) ([03d599e](https://github.com/RiffPress/RiffPress/commit/03d599e8ca70ea9c08d142ef9892eac7bc020594))
* the seed fills artist, album and length from the manifest where PHP cannot read the tags ([#252](https://github.com/RiffPress/RiffPress/issues/252)) ([b9862ed](https://github.com/RiffPress/RiffPress/commit/b9862ed12ee90d313e1f221be6a160fe824c728f))
* the seed takes a track's title from the manifest when the file carries no tag ([#246](https://github.com/RiffPress/RiffPress/issues/246)) ([feda327](https://github.com/RiffPress/RiffPress/commit/feda327a68802a8b851f22e94ec830558e20f082))


### Dependencies

* **deps-dev:** bump globals from 17.12.0 to 17.13.0 in the npm-minor-and-patch group ([#237](https://github.com/RiffPress/RiffPress/issues/237)) ([5c23ae7](https://github.com/RiffPress/RiffPress/commit/5c23ae7c8bef3b2f855c73ea6bbb036968aa0a7f))
* **deps:** bump crate-ci/typos from 1.50.2 to 1.50.3 in the actions-minor-and-patch group ([#238](https://github.com/RiffPress/RiffPress/issues/238)) ([cb3a327](https://github.com/RiffPress/RiffPress/commit/cb3a327c35a083fcc420634b59652b318564790e))

## [3.0.1](https://github.com/promptcorner/callboard/compare/v3.0.0...v3.0.1) (2026-10-11)


### Dependencies

* **deps-dev:** bump @wordpress/e2e-test-utils-playwright from 1.54.0 to 2.1.0 ([#227](https://github.com/promptcorner/callboard/issues/227)) ([fc034df](https://github.com/promptcorner/callboard/commit/fc034df8898ec6716980ed134a5a0c96683eb45c))
* **deps-dev:** bump @wordpress/env from 11.14.0 to 11.16.0 in the npm-minor-and-patch group ([#225](https://github.com/promptcorner/callboard/issues/225)) ([e22cadc](https://github.com/promptcorner/callboard/commit/e22cadcd00b3c356428cf4a156107f071a4d9999))
* **deps-dev:** bump brace-expansion from 1.1.18 to 1.1.21 ([#229](https://github.com/promptcorner/callboard/issues/229)) ([23619c2](https://github.com/promptcorner/callboard/commit/23619c2d40c3fd2c1af1f737da8139eab3104cb6))
* **deps-dev:** bump compression from 1.8.1 to 1.8.2 ([#234](https://github.com/promptcorner/callboard/issues/234)) ([acddd82](https://github.com/promptcorner/callboard/commit/acddd82d342cb5793d7d7fe41f95964e57e2e282))
* **deps-dev:** bump shell-quote from 1.10.0 to 1.12.0 ([#236](https://github.com/promptcorner/callboard/issues/236)) ([04527fa](https://github.com/promptcorner/callboard/commit/04527fa05a46fe66786378a9ca0e1c3933c38375))
* **deps-dev:** bump source-map-js from 1.2.1 to 1.2.2 ([#233](https://github.com/promptcorner/callboard/issues/233)) ([47c1ca0](https://github.com/promptcorner/callboard/commit/47c1ca02d6a5127fc1777881078198299f4c424d))
* **deps-dev:** bump yoast/phpunit-polyfills from 2.0.5 to 4.0.0 ([#224](https://github.com/promptcorner/callboard/issues/224)) ([2be889a](https://github.com/promptcorner/callboard/commit/2be889a6cfe0957518f4adb3346f1d0942e44249))
* **deps:** bump http-cache-semantics from 4.2.0 to 4.3.0 ([#235](https://github.com/promptcorner/callboard/issues/235)) ([59a31ba](https://github.com/promptcorner/callboard/commit/59a31bae3f6e28422a126d91ae8e760b83c9d7c8))
* **deps:** bump ip-address from 10.7.0 to 10.7.2 ([#228](https://github.com/promptcorner/callboard/issues/228)) ([97373a1](https://github.com/promptcorner/callboard/commit/97373a16d9f71405fed2abfd036db433271fcfb0))
* **deps:** bump markdown-it and @wordpress/scripts ([#223](https://github.com/promptcorner/callboard/issues/223)) ([12a22b5](https://github.com/promptcorner/callboard/commit/12a22b59a493eaff03504389e7b06f6bde5ef683))
* **deps:** bump proxy-addr from 2.0.7 to 2.0.8 ([#232](https://github.com/promptcorner/callboard/issues/232)) ([3458544](https://github.com/promptcorner/callboard/commit/3458544fbd13e463c45461ea5a0557b16b1f2de0))
* **deps:** bump the actions-minor-and-patch group with 2 updates ([#226](https://github.com/promptcorner/callboard/issues/226)) ([fff383c](https://github.com/promptcorner/callboard/commit/fff383ce9bc00dc725a8ea52908908fa56e5a16b))

## [3.0.0](https://github.com/promptcorner/callboard/compare/v2.7.0...v3.0.0) (2026-09-25)


### ⚠ BREAKING CHANGES

* remove the A/B loop and lyrics ([#222](https://github.com/promptcorner/callboard/issues/222))
* remove director's notes, count-in, and the Director role ([#220](https://github.com/promptcorner/callboard/issues/220))
* remove calls, the board, and push notifications ([#218](https://github.com/promptcorner/callboard/issues/218))

### Features

* remove calls, the board, and push notifications ([#218](https://github.com/promptcorner/callboard/issues/218)) ([2d47346](https://github.com/promptcorner/callboard/commit/2d473468b7bfc9f8d2d26923573a7af40d8e9617))
* remove director's notes, count-in, and the Director role ([#220](https://github.com/promptcorner/callboard/issues/220)) ([367c8ec](https://github.com/promptcorner/callboard/commit/367c8ec00ab6d700dae8b416a076a1e02d4c970a))
* remove the A/B loop and lyrics ([#222](https://github.com/promptcorner/callboard/issues/222)) ([6c73a68](https://github.com/promptcorner/callboard/commit/6c73a68959bd85d31b009286d3e2245a7d9b97b9))

## [2.7.0](https://github.com/promptcorner/callboard/compare/v2.6.0...v2.7.0) (2026-09-20)


### Features

* add native set publishing workflow ([#209](https://github.com/promptcorner/callboard/issues/209)) ([8b90c16](https://github.com/promptcorner/callboard/commit/8b90c16c0aae2061003a01b20ef9314009aa7725))
* complete offline set-file transfer between phones ([#216](https://github.com/promptcorner/callboard/issues/216)) ([2908bc5](https://github.com/promptcorner/callboard/commit/2908bc566884ffc82e367a6c892a0d1c3af1b542))
* integrate WordPress admin chrome with Callboard ([#210](https://github.com/promptcorner/callboard/issues/210)) ([8ddfeb9](https://github.com/promptcorner/callboard/commit/8ddfeb99f1b6297e578575d4c41c3e936ff2d8ec))
* replace demo audio and generated artwork ([#213](https://github.com/promptcorner/callboard/issues/213)) ([7b1eed1](https://github.com/promptcorner/callboard/commit/7b1eed177cccbb867cf9e060d8a4d8ad74777c1a))
* tighten 2.5.0 polish: accurate landing copy/nav, 664px mobile fixes, and safer local tooling ([#215](https://github.com/promptcorner/callboard/issues/215)) ([cff814f](https://github.com/promptcorner/callboard/commit/cff814f8124c39a6d5dc3f7b78cf0c3c141f6a50))


### Dependencies

* **deps:** bump adm-zip from 0.6.0 to 0.6.1 ([#212](https://github.com/promptcorner/callboard/issues/212)) ([5b9122a](https://github.com/promptcorner/callboard/commit/5b9122a7040e4a0bf5ae26ab8c07a765cf0d1e9d))

## [2.6.0](https://github.com/promptcorner/callboard/compare/v2.5.0...v2.6.0) (2026-09-14)


### Features

* write a set file on a phone and open one, for sharing a set on a USB stick ([#207](https://github.com/promptcorner/callboard/issues/207)) ([a433f8e](https://github.com/promptcorner/callboard/commit/a433f8eb126c64bbd122be457416e9ab184f7c96))

## [2.5.0](https://github.com/promptcorner/callboard/compare/v2.4.0...v2.5.0) (2026-09-14)


### Features

* close Now Playing by dragging it down, and size the player like Tidal's ([#199](https://github.com/promptcorner/callboard/issues/199)) ([c94d7d3](https://github.com/promptcorner/callboard/commit/c94d7d30a5ad0588dd60970f836778395f972e5e))
* register abilities to list playlists, list upcoming calls and post a call ([#201](https://github.com/promptcorner/callboard/issues/201)) ([aa42f9d](https://github.com/promptcorner/callboard/commit/aa42f9d199ae12ed6b3172f6041d623ed4bdd25e))


### Bug Fixes

* keep each network site's maskable icon separate ([#193](https://github.com/promptcorner/callboard/issues/193)) ([382f6bb](https://github.com/promptcorner/callboard/commit/382f6bb36b69384dbeb52581075edef1e030fb33))
* keep extension scripts loading and available offline ([#202](https://github.com/promptcorner/callboard/issues/202)) ([af95d81](https://github.com/promptcorner/callboard/commit/af95d81b2e5bba97a49e29f460753596cc26d42f))
* keep the A-B loop working after moving to another track ([#200](https://github.com/promptcorner/callboard/issues/200)) ([77a6be2](https://github.com/promptcorner/callboard/commit/77a6be25733fbcf2a25a484360af409bdabcfd01))

## [2.4.0](https://github.com/promptcorner/callboard/compare/v2.3.0...v2.4.0) (2026-09-13)


### Features

* let the director pick the track that every following phone opens ([#183](https://github.com/promptcorner/callboard/issues/183)) ([de14c2b](https://github.com/promptcorner/callboard/commit/de14c2b7363c75539d17cf71c1d8bd3a6e001cb7))
* store director notes as callboard_note comments ([#186](https://github.com/promptcorner/callboard/issues/186)) ([857dbf8](https://github.com/promptcorner/callboard/commit/857dbf8e57ff62bc4a6936d5e92dfbef4583626e))
* support multisite networks, with a service worker and manifest for each site ([#179](https://github.com/promptcorner/callboard/issues/179)) ([f48b7d7](https://github.com/promptcorner/callboard/commit/f48b7d71139b75167fae5af59a98687379195851))
* use the site icon for the app icon and splash screens ([#175](https://github.com/promptcorner/callboard/issues/175)) ([b96111a](https://github.com/promptcorner/callboard/commit/b96111a0fb03081d23bf2483e383c6636450620b))


### Bug Fixes

* move third-party extension routes under ext/, reserve namespaces, and add the REST nonce to app data ([#189](https://github.com/promptcorner/callboard/issues/189)) ([0350a84](https://github.com/promptcorner/callboard/commit/0350a84e5162ce2447a616e794b1d957f0e19367))
* notify cast about director notes ([#187](https://github.com/promptcorner/callboard/issues/187)) ([c651c1d](https://github.com/promptcorner/callboard/commit/c651c1de7539b1a618da4dca8d8ee8eeb45aa4ff))

## [2.3.0](https://github.com/promptcorner/callboard/compare/v2.2.0...v2.3.0) (2026-09-12)


### Features

* add an extension API, and rebuild the count-in, audio quality label and Home Screen badge on it ([#137](https://github.com/promptcorner/callboard/issues/137)) ([de885f8](https://github.com/promptcorner/callboard/commit/de885f8ce85947fa8560935538ee9912d02be80b))
* add Director and Cast member roles ([#177](https://github.com/promptcorner/callboard/issues/177)) ([975cfe9](https://github.com/promptcorner/callboard/commit/975cfe972b26c4aa002322cfd44a85693c1dfc58))
* filters on callboard_set_data below priority 5 no longer see a track's top-level bpm and quality ([#137](https://github.com/promptcorner/callboard/issues/137)) ([de885f8](https://github.com/promptcorner/callboard/commit/de885f8ce85947fa8560935538ee9912d02be80b))
* show how much each track was practiced since the last call ([#157](https://github.com/promptcorner/callboard/issues/157)) ([33e7031](https://github.com/promptcorner/callboard/commit/33e70312b85c836ddc9e1bd5fbf123b16abe1f57))
* the track in the callboard:track event is now a frozen copy instead of the player's own track object ([#137](https://github.com/promptcorner/callboard/issues/137)) ([de885f8](https://github.com/promptcorner/callboard/commit/de885f8ce85947fa8560935538ee9912d02be80b))


### Bug Fixes

* clean up extension commands and discard stale badge results ([#164](https://github.com/promptcorner/callboard/issues/164)) ([6e47029](https://github.com/promptcorner/callboard/commit/6e47029f20b146b68f70766c76dd09768cdd2bc0))
* close Now Playing with the back button, Escape or a close button instead of a swipe ([#154](https://github.com/promptcorner/callboard/issues/154)) ([8926af4](https://github.com/promptcorner/callboard/commit/8926af4840c401115b06ae686a5675830d1ad0a6))
* keep player scripts in footer ([#153](https://github.com/promptcorner/callboard/issues/153)) ([24ae648](https://github.com/promptcorner/callboard/commit/24ae648082394c4f3569eee769efa11d3cfd0c71))
* keep the level meter moving on the home page ([#122](https://github.com/promptcorner/callboard/issues/122)) ([0e54d9c](https://github.com/promptcorner/callboard/commit/0e54d9cfb328ec930f9fa6b6e420adb7367bf364))
* load the Playground demo again after the repository moved ([#132](https://github.com/promptcorner/callboard/issues/132)) ([2fd1be5](https://github.com/promptcorner/callboard/commit/2fd1be5f4566f913c2b2412c7126291a191f93a4))
* make the landing page demo preview accurate and easy to start ([#156](https://github.com/promptcorner/callboard/issues/156)) ([a06ad5e](https://github.com/promptcorner/callboard/commit/a06ad5efdb535514823574dd2347e305a582089d))
* only mark a playlist as saved offline once it can open without a connection ([#135](https://github.com/promptcorner/callboard/issues/135)) ([c18ef33](https://github.com/promptcorner/callboard/commit/c18ef33487bc9fa50c8365b5c3054f46838b1520))
* preserve extension assets in the offline cache after updates ([#152](https://github.com/promptcorner/callboard/issues/152)) ([106948c](https://github.com/promptcorner/callboard/commit/106948c976d09cf0d9921fdb12df23dab8534065))
* stabilize extension cache variants and memoize active registry resolution ([#150](https://github.com/promptcorner/callboard/issues/150)) ([d24449d](https://github.com/promptcorner/callboard/commit/d24449d886c9c2af56ec4e26e3548d675c839d70))
* start the gapless loop when both ends are set quickly ([#167](https://github.com/promptcorner/callboard/issues/167)) ([540c31b](https://github.com/promptcorner/callboard/commit/540c31b8b159230986d89df9478232e5dcc968ef))
* stop calling imagedestroy(), which is deprecated in PHP 8.5 ([#136](https://github.com/promptcorner/callboard/issues/136)) ([75c1a70](https://github.com/promptcorner/callboard/commit/75c1a70d5b2f6c2791658487ac89ebd109670ec5))

## [2.2.0](https://github.com/promptcorner/callboard/compare/v2.1.0...v2.2.0) (2026-09-12)


### Features

* declare the data model with register_post_meta ([#115](https://github.com/promptcorner/callboard/issues/115)) ([9fd95b6](https://github.com/promptcorner/callboard/commit/9fd95b66d0a1f680ab4ad93d57a6448331d2de8a))
* give the deck one system, and a size it earns ([#105](https://github.com/promptcorner/callboard/issues/105)) ([cac06fc](https://github.com/promptcorner/callboard/commit/cac06fc36eadd0acfd437523b987ca0fd85ffc93))
* Now Playing is a screen, not a taller bar ([#110](https://github.com/promptcorner/callboard/issues/110)) ([8df5a93](https://github.com/promptcorner/callboard/commit/8df5a93e3c907bc8e980e76ae3fcbc3ad0f3820b))
* PHP unit tests, one Share, and a cover for every set ([#107](https://github.com/promptcorner/callboard/issues/107)) ([baa3df9](https://github.com/promptcorner/callboard/commit/baa3df9f34ea9677472ac9edb68ebe65289f0cd2))
* quality tiers, and a manifest that keeps up with the sets ([#109](https://github.com/promptcorner/callboard/issues/109)) ([6b92f0f](https://github.com/promptcorner/callboard/commit/6b92f0f545a4c20ca0b63116735d47d11942564f))
* real recordings, per-track artist and quality, and a filament that ranges itself ([#94](https://github.com/promptcorner/callboard/issues/94)) ([ad75627](https://github.com/promptcorner/callboard/commit/ad75627a3a75cf395b7397163bcedeff92863538))
* the tab carries the track, and durable storage that actually asks ([#108](https://github.com/promptcorner/callboard/issues/108)) ([bb11417](https://github.com/promptcorner/callboard/commit/bb114176ec9e86131a3a840571d2dcdbd9b36fce))


### Bug Fixes

* a push endpoint must be somewhere the internet can reach ([#117](https://github.com/promptcorner/callboard/issues/117)) ([2324af7](https://github.com/promptcorner/callboard/commit/2324af79709fa53edc317b34dfae0dc16d83b38e))
* fetch the truest copy available, and stop inflating it ([#104](https://github.com/promptcorner/callboard/issues/104)) ([cfb6b82](https://github.com/promptcorner/callboard/commit/cfb6b82aba8d7e70590fb9aeae3f932b376257c5))
* fit a long set name inside its cover ([#93](https://github.com/promptcorner/callboard/issues/93)) ([c28ea57](https://github.com/promptcorner/callboard/commit/c28ea57c188c2d59e025064c4247fb2c831e8485))
* keep the offline badge inside the row ([#106](https://github.com/promptcorner/callboard/issues/106)) ([d2d8ffe](https://github.com/promptcorner/callboard/commit/d2d8ffe9c63b0fbfb2df4e30618956e156529f14))
* one column in Now Playing, and unit symbols that keep their casing ([#112](https://github.com/promptcorner/callboard/issues/112)) ([8380fbb](https://github.com/promptcorner/callboard/commit/8380fbb4cdffa8162d290fcb04319917c430232b))


### Dependencies

* **deps-dev:** bump globals from 16.5.0 to 17.12.0 ([#102](https://github.com/promptcorner/callboard/issues/102)) ([64d28a6](https://github.com/promptcorner/callboard/commit/64d28a68163261de7c2048c0db1f7ead3c5cb277))
* **deps:** bump crate-ci/typos from 1.50.0 to 1.50.1 in the actions-minor-and-patch group ([#103](https://github.com/promptcorner/callboard/issues/103)) ([1a93116](https://github.com/promptcorner/callboard/commit/1a93116c19b4c8258bbdd2cdbe02fdbec1cbe16e))

## [2.1.0](https://github.com/josephfusco/callboard/compare/v2.0.1...v2.1.0) (2026-09-12)


### Features

* export a set as a folder a car stereo can read ([#89](https://github.com/josephfusco/callboard/issues/89)) ([c8e6a1b](https://github.com/josephfusco/callboard/commit/c8e6a1b480601ae78763264c369be76aa1a5ccc5))
* export and import a set as a single .callboard file ([#87](https://github.com/josephfusco/callboard/issues/87)) ([402d2eb](https://github.com/josephfusco/callboard/commit/402d2eb206c8556355442bd0eb80b3fbdff444f7))
* fill a set's offline copies from a file ([#91](https://github.com/josephfusco/callboard/issues/91)) ([a72ad94](https://github.com/josephfusco/callboard/commit/a72ad94e62f6097a1a56010d8ae819e2e741447f))
* gate the front end with whatever auth the site already has ([#90](https://github.com/josephfusco/callboard/issues/90)) ([75e10a8](https://github.com/josephfusco/callboard/commit/75e10a85b95c9c4e0835106070d063317682d094))
* send the playing track to the phone next to you ([#92](https://github.com/josephfusco/callboard/issues/92)) ([20940b1](https://github.com/josephfusco/callboard/commit/20940b1c6fd23d1e589dd4c56875d6a63324b636))

## [2.0.1](https://github.com/josephfusco/callboard/compare/v2.0.0...v2.0.1) (2026-09-11)


### Bug Fixes

* drop a stray screenshot that shipped in the package ([#72](https://github.com/josephfusco/callboard/issues/72)) ([6b30513](https://github.com/josephfusco/callboard/commit/6b30513800080400e9e0ff7351296cfab186a9c7))

## [2.0.0](https://github.com/josephfusco/callboard/compare/v1.6.1...v2.0.0) (2026-09-11)


### ⚠ BREAKING CHANGES

* remove the dot-matrix display ([#71](https://github.com/josephfusco/callboard/issues/71))
* the transport is previous, play, next ([#62](https://github.com/josephfusco/callboard/issues/62))

### Features

* remove the dot-matrix display ([#71](https://github.com/josephfusco/callboard/issues/71)) ([c0fa513](https://github.com/josephfusco/callboard/commit/c0fa5133bb9c4217993907ecca2f1efebef9b2db))
* the deck reads like a dashboard, with a dot-matrix display option ([#67](https://github.com/josephfusco/callboard/issues/67)) ([ef6d468](https://github.com/josephfusco/callboard/commit/ef6d468d80c154dad6689f38ffe38f0f8bf3ef37))
* the dot-matrix display draws its own glyphs, a spectrum, and a swimmer ([#68](https://github.com/josephfusco/callboard/issues/68)) ([6b9b085](https://github.com/josephfusco/callboard/commit/6b9b085cbc00fc6ef8a14c03813518bdbbf5c17c))
* the transport is previous, play, next ([#62](https://github.com/josephfusco/callboard/issues/62)) ([f9fc59d](https://github.com/josephfusco/callboard/commit/f9fc59d0965bc5c1a45ebb5b60b7ceef0365c228))


### Bug Fixes

* re-importing a set no longer deletes its cover ([#65](https://github.com/josephfusco/callboard/issues/65)) ([230150d](https://github.com/josephfusco/callboard/commit/230150df019dd3256d50185c25626c9f7632a2f7))
* the deck as one system ([#69](https://github.com/josephfusco/callboard/issues/69)) ([c8acc53](https://github.com/josephfusco/callboard/commit/c8acc53c8500b5df17b6d8331f5001688b9fa471))
* the list and the deck share one right edge ([#70](https://github.com/josephfusco/callboard/issues/70)) ([e778dc3](https://github.com/josephfusco/callboard/commit/e778dc3bc2c4ae9a8b79f335f510df3fc6bd3fc2))
* the waveform is bars alone, centred, no reflection ([#66](https://github.com/josephfusco/callboard/issues/66)) ([6350082](https://github.com/josephfusco/callboard/commit/6350082375eac029f9411c222ce079efc1bd3695))

## [1.6.1](https://github.com/josephfusco/callboard/compare/v1.6.0...v1.6.1) (2026-09-09)


### Bug Fixes

* open Playground in seamless mode so its toolbar stays off the player ([#56](https://github.com/josephfusco/callboard/issues/56)) ([1ab8882](https://github.com/josephfusco/callboard/commit/1ab88827bc1abbb6cb51386d6a0630cf18aa6bca))
* stamp demo asset URLs with the commit so Pages caching never shows an old build ([#58](https://github.com/josephfusco/callboard/issues/58)) ([bdb1daa](https://github.com/josephfusco/callboard/commit/bdb1daad20000b440b2b7cb74feb3efe1a9867ac))

## [1.6.0](https://github.com/josephfusco/callboard/compare/v1.5.0...v1.6.0) (2026-09-09)


### Features

* a refinement pass on the deck and lists ([#32](https://github.com/josephfusco/callboard/issues/32)) ([9bac90e](https://github.com/josephfusco/callboard/commit/9bac90eb68ba6c04e91aba3ba5f38954015d0fe1))
* an accent colour, and a small developer API ([#47](https://github.com/josephfusco/callboard/issues/47)) ([1542d73](https://github.com/josephfusco/callboard/commit/1542d738445297b9364da20ddc61ae67552e7bda))
* the board ([#40](https://github.com/josephfusco/callboard/issues/40)) ([c72f044](https://github.com/josephfusco/callboard/commit/c72f04481c79cc2212edaa9df6532b10182ad43a))
* the filament behaves like one ([#26](https://github.com/josephfusco/callboard/issues/26)) ([c90b000](https://github.com/josephfusco/callboard/commit/c90b0005715793f649967f4dd0577ba9bbe07d3a))
* the landing page runs a live copy in WordPress Playground ([#49](https://github.com/josephfusco/callboard/issues/49)) ([c2f8dc6](https://github.com/josephfusco/callboard/commit/c2f8dc6d3720c60c96d53da792f2584d1f848ee0))
* the play button answers like a Magic 8-Ball ([#30](https://github.com/josephfusco/callboard/issues/30)) ([329ab25](https://github.com/josephfusco/callboard/commit/329ab25c9c6e0690c9fae9721221f2104e69c8ec))


### Bug Fixes

* an iOS Safari pass on the front end ([#37](https://github.com/josephfusco/callboard/issues/37)) ([0fc0fd7](https://github.com/josephfusco/callboard/commit/0fc0fd725bb4b04c7fd885d494a9dd4b3470e280))
* play and pause the way YouTube does it ([#39](https://github.com/josephfusco/callboard/issues/39)) ([ecce724](https://github.com/josephfusco/callboard/commit/ecce7246e6bba225b4214d0984401a2b998f9dcc))
* switching tracks no longer pauses the new one ([#29](https://github.com/josephfusco/callboard/issues/29)) ([ad4800b](https://github.com/josephfusco/callboard/commit/ad4800b617ec3ac57d111a53a3363259c555aa07))
* the 8-Ball has a real viewing window ([#31](https://github.com/josephfusco/callboard/issues/31)) ([69449de](https://github.com/josephfusco/callboard/commit/69449dee8ffcbbc8aaafdd2b3aff0cf89c963d09))
* the board is a list, not a stack of cards ([#51](https://github.com/josephfusco/callboard/issues/51)) ([9184dea](https://github.com/josephfusco/callboard/commit/9184dea47bb3fdaef7e82cf46207896ceeb28474))
* the filament is the deck's top edge again, and the wave sits flush beneath it ([#34](https://github.com/josephfusco/callboard/issues/34)) ([a65f810](https://github.com/josephfusco/callboard/commit/a65f810547b066b61c8bd88d3270a646a0f88063))
* the play key is a solid disc again ([#35](https://github.com/josephfusco/callboard/issues/35)) ([c4cf101](https://github.com/josephfusco/callboard/commit/c4cf1013598478bb31fe58ebf9fa72cbbef32485))
* the set header keeps to one line on small phones ([#50](https://github.com/josephfusco/callboard/issues/50)) ([27838dc](https://github.com/josephfusco/callboard/commit/27838dcf29197f7d7be9bccf361bc348c725aec0))


### Performance Improvements

* playback moves only compositor transforms ([#52](https://github.com/josephfusco/callboard/issues/52)) ([02e5dfa](https://github.com/josephfusco/callboard/commit/02e5dfa1b4160018119bd31a1dfe926d3823c971))

## [1.5.0](https://github.com/josephfusco/callboard/compare/v1.4.2...v1.5.0) (2026-09-07)


### Features

* a deeper deck, with the controls drawn as things you can press ([#21](https://github.com/josephfusco/callboard/issues/21)) ([604dc52](https://github.com/josephfusco/callboard/commit/604dc52a1fab2512d3555dec8fe90d4d30ec91bc))
* a gapless A/B loop while the page is in front ([#25](https://github.com/josephfusco/callboard/issues/25)) ([d552105](https://github.com/josephfusco/callboard/commit/d552105bc3efa0a517b442f9ca6053d4ed821a12))
* lyric cues as a text track, one player per site, push subscriptions that survive rotation ([#23](https://github.com/josephfusco/callboard/issues/23)) ([2e29e6c](https://github.com/josephfusco/callboard/commit/2e29e6c03973f8ff49f0149f33de31b1454b77bc))
* waveform in the deck, and a deck that keeps one height ([#18](https://github.com/josephfusco/callboard/issues/18)) ([1f85655](https://github.com/josephfusco/callboard/commit/1f8565538f367e91f2e663f634d72b278a98e19a))


### Bug Fixes

* the deck row never collides with the controls, and saving knows about space ([#17](https://github.com/josephfusco/callboard/issues/17)) ([ccb3e89](https://github.com/josephfusco/callboard/commit/ccb3e89582aa6b0bcbfa6ba2dd9d5b3584b918b9))

## [1.4.2](https://github.com/josephfusco/callboard/compare/v1.4.1...v1.4.2) (2026-09-07)


### Bug Fixes

* polish the set header, deck time row, and stylesheet ([#15](https://github.com/josephfusco/callboard/issues/15)) ([a750016](https://github.com/josephfusco/callboard/commit/a750016d2d66dc4a900e57120d7ae19ef9cd8215))

## [1.4.1](https://github.com/josephfusco/callboard/compare/v1.4.0...v1.4.1) (2026-09-07)


### Dependencies

* **deps-dev:** bump @wordpress/scripts to 34 and @wordpress/env to 11 ([#13](https://github.com/josephfusco/callboard/issues/13)) ([98ac56a](https://github.com/josephfusco/callboard/commit/98ac56a16d54b0703c40401ea78e34b7e04d4457))

## [1.4.0](https://github.com/josephfusco/callboard/compare/v1.3.2...v1.4.0) (2026-09-07)


### Features

* AirPlay and Cast from the deck ([#11](https://github.com/josephfusco/callboard/issues/11)) ([29618ec](https://github.com/josephfusco/callboard/commit/29618ec1649509c9d53268dd61dc9a774a87d503))
* share a set from its page ([#12](https://github.com/josephfusco/callboard/issues/12)) ([f86efba](https://github.com/josephfusco/callboard/commit/f86efba4be77587013ceb230d6debdf0e1cf50bf))
* speed chip slows playback and keeps the pitch ([#10](https://github.com/josephfusco/callboard/issues/10)) ([8cfc4ed](https://github.com/josephfusco/callboard/commit/8cfc4ed703dfc11754f291a8849210fa71c21717))


### Bug Fixes

* declare the license in the plugin header and mark tested up to 7.1 ([a50b072](https://github.com/josephfusco/callboard/commit/a50b0726ab724cdd431ba1e3d3e78bf165f97abb))
* haptics fire on iOS taps ([#9](https://github.com/josephfusco/callboard/issues/9)) ([8452c1c](https://github.com/josephfusco/callboard/commit/8452c1c82bc72dc13b25cc6fe632aaa16705325f))


### Dependencies

* **deps:** bump crate-ci/typos from 1.49.0 to 1.50.0 ([#1](https://github.com/josephfusco/callboard/issues/1)) ([6c42db5](https://github.com/josephfusco/callboard/commit/6c42db5426881121bc5ec0ed4623212725ed2244))

## 1.0.0
- First release: sets as posts, tracks as attachments, persistent player, installable app, offline saving, Web Push notices, WP-CLI fetching with yt-dlp, folder import.
