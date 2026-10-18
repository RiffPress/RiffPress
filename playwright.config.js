/**
 * Playwright config: WordPress defaults, in three projects.
 *
 * - chromium: desktop Chromium, every spec.
 * - mobile-chromium: Chromium with an iPhone 14's viewport, touch and user agent, for the player,
 *   Listen and Riff Lyrics specs. It is a phone-sized layout, not Safari: the player sees an iPhone user
 *   agent and keeps audio off Web Audio, as it does on a real iPhone, but the engine is Chromium.
 * - webkit: desktop WebKit, the engine under Safari, for the tests tagged `@smoke`. It shows that
 *   playback and Now Playing work in WebKit; it says nothing about iOS background playback, lock
 *   screen or AirPlay, which docs/iphone-checklist.md covers on a real phone.
 */
const fs = require( 'fs' );
const path = require( 'path' );
const { defineConfig, devices } = require( '@playwright/test' );
const base = require( '@wordpress/scripts/config/playwright.config.js' );

/**
 * The tests site's port, read the way wp-env reads it.
 *
 * .wp-env.json is committed and CI sees only that, but .wp-env.override.json is gitignored and
 * moves the ports whenever another wp-env project on the same machine already holds them. A
 * hardcoded port then points the suite at somebody else's WordPress, where it fails fetching a REST
 * nonce — which reads like an auth bug and is not one. Reading both files is what wp-env does, so
 * this agrees with it by construction.
 */
const testsPort = () => {
	let port = 8889;
	for ( const name of [ '.wp-env.json', '.wp-env.override.json' ] ) {
		const file = path.join( __dirname, name );
		if ( ! fs.existsSync( file ) ) {
			continue;
		}
		try {
			const json = JSON.parse( fs.readFileSync( file, 'utf8' ) );
			if ( typeof json.testsPort === 'number' ) {
				port = json.testsPort;
			}
		} catch {
			// A malformed override is the developer's to fix; the default still runs.
		}
	}
	return port;
};

process.env.WP_BASE_URL =
	process.env.WP_BASE_URL || `http://localhost:${ testsPort() }`;

module.exports = defineConfig( {
	...base,
	testDir: './plugins',
	testMatch: /tests\/e2e\/.+\.spec\.js$/,
	reporter: process.env.CI ? [ [ 'github' ], [ 'list' ] ] : 'list',
	projects: [
		{ name: 'chromium', use: { ...base.use } },
		{
			name: 'mobile-chromium',
			use: {
				...base.use,
				...devices[ 'iPhone 14' ],
				defaultBrowserType: 'chromium',
			},
			testMatch: /tests\/e2e\/(player|app|lyrics)\.spec\.js$/,
		},
		{
			name: 'webkit',
			use: { ...base.use, ...devices[ 'Desktop Safari' ] },
			testMatch: /tests\/e2e\/player\.spec\.js$/,
			grep: /@smoke/,
		},
	],
} );
