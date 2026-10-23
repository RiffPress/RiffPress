# Riff for the desktop

A Riff site's Listen library in a window of its own: the standalone Listen page (the Listen page's address plus `app/`) in Electron, with the media keys and the system's Now Playing, which come from the page's Media Session as they do in a browser.

On first launch it asks for the site's address. The Listen page's address, as the browser shows it, always works; a site's own address works when the site has a published Listen page, found through core's pages route. Signing in is WordPress's own login, in the window; tick **Remember Me** and the cookie outlasts a restart. **Change Site…** is in the app menu (File on Windows and Linux). **Import Music…** in the File menu adds files or folders of MP3, M4A, FLAC, Ogg, Opus or WAV to the site's Media Library through core's media route, as whoever is signed in, skipping any it already has.

Only the site's origin loads in the window. Every other link opens in the default browser, and the site needs https unless it is on this computer.

## Developing

Two ways in, both against your wp-env site:

- `npm run desktop` from the repository root runs the app from source, on the development site wp-env serves (its port read from `.wp-env.json` and `.wp-env.override.json`), with the developer tools in the View menu and a reload whenever a file under `plugins/` changes.
- In a browser, open the Listen page's `app/` address with `?riff_desktop=1` to see the app's layout, with the traffic lights drawn in, and use the browser's own tools. It works only with `SCRIPT_DEBUG` or `WP_DEBUG` on, which wp-env has, and stays on in that browser until `?riff_desktop=0`.

```bash
npm test --workspace=packages/desktop          # the address handling and the updater's choices
RIFF_DESKTOP_E2E=1 npm run build:dir --workspace=packages/desktop
npx playwright test --config packages/desktop/playwright.config.js   # the unpacked app against the tests site
```

`RIFF_DESKTOP_E2E=1` keeps the fuse Playwright attaches through; release builds turn it off. Without a build in `dist/` the e2e suite drives the source instead.

## Releases and updates

release-please releases the app as `riff-desktop-v0.x.y`, and `release-please.yml` builds a dmg and a zip for macOS, an NSIS installer for Windows and an AppImage for Linux, and attaches them with their `latest*.yml` to the release.

The app finds its own updates. This repository's releases also hold Riff, Riff Lyrics and wp-api-coverage, so it lists them, takes the newest `riff-desktop-v*`, and reads that release's metadata ([src/updates.js](src/updates.js)). Windows and the AppImage install the update. macOS installs only into a signed app, so until the builds are signed a Mac copy says a new version is out and links to it.

To try the updater against a folder of your own builds, serve the folder and run the source with `RIFF_UPDATE_FEED=http://localhost:8000/ npx electron packages/desktop`, then **Check for Updates…**.

Signing switches on when the secrets are stored: `CSC_LINK` and `CSC_KEY_PASSWORD` for macOS, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` for notarisation, and `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` for Windows.
