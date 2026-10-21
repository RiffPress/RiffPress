/**
 * Playwright for the desktop app: Electron driven through _electron, against the wp-env tests site.
 *
 * It drives the unpacked build in dist/ when there is one (npm run build:dir with
 * RIFF_DESKTOP_E2E=1, which keeps the inspector fuse Playwright attaches through), and the source
 * otherwise. One worker: each test launches the app, and they share one profile in order.
 */
const path = require( 'node:path' );
const { defineConfig } = require( '@playwright/test' );

// The root config works out the tests site's address from .wp-env.json and its override, and puts
// it in WP_BASE_URL.
require( '../../playwright.config.js' );

module.exports = defineConfig( {
	testDir: './test/e2e',
	testMatch: /\.spec\.js$/,
	timeout: 90000,
	workers: 1,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? [ [ 'github' ], [ 'list' ] ] : 'list',
	outputDir: path.join( __dirname, '..', '..', 'artifacts', 'desktop' ),
	use: { trace: 'retain-on-failure' },
} );
