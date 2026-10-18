# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Independent artists, labels and anyone who publishes music or video on a WordPress site, people who want their own music library on a site they control, and the listeners who arrive at their posts. Site owners want their recordings to play as well as they do in a streaming app without handing the catalogue to one. Listeners expect a player that behaves like the ones on their phone.

## Product Purpose

Riff turns the audio and video already in a site's posts into a player with the fit and finish of a streaming app, with nothing to configure and no new place to put files. Success means a listener taps a track and it plays at once, keeps playing while they read, and the Now Playing screen feels like the one they know.

## Positioning

Riff is an open-source music player for WordPress. The Media Library is the store: every track is an attachment, read through WordPress's own APIs, and posts are how music is published from it. Riff is the listening surface on top. Where a music library needs something WordPress doesn't have, Riff adds it and records why in `docs/native.md`, so each addition is a candidate for core. Its design follows YouTube Music's current layout and measurements, which is the benchmark listeners already carry in their pocket, in Riff's own amber.

## Operating Context

Publishers write ordinary posts with the core audio and video blocks, and pair a song with its video from the Media Library. Listeners arrive from a link, usually on a phone, and may lock the screen, put the phone away, or move to another post while a track plays.

## Capabilities and Constraints

- The player is added to every front-end page of any theme; the theme's own markup is left alone.
- Tracks are audio attachments in the Media Library. The core audio, video and playlist blocks publish them in posts, and registered sources can provide tracks from other post types or catalogues. A post is a queue.
- One script and one stylesheet, no build step. Every browser feature sits behind a check and degrades to the browser's native controls.
- Playback: a docked bar, Now Playing with Up next, a Song/Video switch, Media Session, AirPlay and Cast, keyboard control, and the filament, an analyser-driven glow on the bar's seek line. In-app navigation on a Listen page keeps the same media element; full-page navigation saves the tab's session state and attempts to resume on the next page, while reload restores the track paused.
- Not in scope: recommendations, radio, podcast feeds, analytics, and lyrics (planned as a feature plugin). Accounts are WordPress users. Favorites, a library view of the Media Library, a hosted network and a desktop app are on the roadmap (#365); offline listening is planned only in the desktop app.
- The iOS and desktop apps are not built yet. Both will connect to a Riff site through the REST API and application passwords.
- The plugin works on a single site on its own. A hosted network runs the same plugin; anything only the network needs goes in a separate plugin.
- Anything that works across sites uses open standards rather than anything Riff-only.

## Brand Commitments

The name is Riff. The voice is direct and practical, in plain WordPress-developer language, free of marketing hype.

## Evidence on Hand

- Architecture and behaviour: `README.md`
- Listener-facing implementation: `plugins/riff/templates/player.php`, `plugins/riff/assets/riff.js`, `plugins/riff/assets/riff.css`
- Public-domain demo media and screenshots: `packages/fixtures/`, `site/`

No testimonials, adoption metrics, customer logos or performance claims are available and none should be invented.

## Product Principles

1. Music starts in one tap.
2. The Media Library is the store and a post is a queue; nothing to set up.
3. Match the players listeners already know, measurement for measurement.
4. WordPress conventions are an advantage; extend them instead of hiding them.
5. Degrade to native controls, never to nothing.

## Accessibility & Inclusion

Native controls underneath, keyboard operation, visible focus, reduced-motion and reduced-transparency support, 44px touch targets, labelled controls, and automated accessibility checks in the test suite.
