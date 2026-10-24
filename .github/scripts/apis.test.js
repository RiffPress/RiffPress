/**
 * The Built on the open web page lists every browser API and CSS feature the player uses. This
 * holds the list to the code: each listed API must still be used somewhere in the plugin, and each must have a
 * pattern here that says what "used" means, so a listing cannot outlive its code and a new entry
 * cannot be added without saying where it lives. Run by `node --test .github/scripts/*.test.js`.
 */
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { test } = require( 'node:test' );

const ROOT = path.resolve( __dirname, '..', '..' );
const read = ( file ) => fs.readFileSync( path.join( ROOT, file ), 'utf8' );

const JS = [ 'plugins/riff/assets/riff.js', 'plugins/riff/features/listen/app.js' ].map( read ).join( '\n' );
const CSS = [ 'plugins/riff/assets/tokens.css', 'plugins/riff/assets/riff.css', 'plugins/riff/features/listen/app.css', 'plugins/riff/features/listen/standalone.css', 'plugins/riff/features/listen/desktop.css' ].map( read ).join( '\n' );
const PHP = [ 'plugins/riff/templates/player.php', 'plugins/riff/features/listen/class-app.php', 'plugins/riff/src/class-player.php' ].map( read ).join( '\n' );
const ALL = JS + '\n' + CSS + '\n' + PHP;

/* What each listed name means in the code. A name listed on the page without an entry here fails;
   an entry whose pattern no longer matches fails. */
const USES = {
	HTMLMediaElement: [ JS, /\.(currentTime|play\(\)|pause\(\)|fastSeek)/ ],
	TimeRanges: [ JS, /\.buffered\b/ ],
	'Screen Wake Lock': [ JS, /navigator\.wakeLock/ ],
	Vibration: [ JS, /navigator\.vibrate/ ],
	'Network Information': [ JS, /navigator\.connection/ ],
	'Media Session': [ JS, /navigator\.mediaSession/ ],
	'Remote Playback': [ JS, /\.remote\.(watchAvailability|prompt)|webkitShowPlaybackTargetPicker/ ],
	'Web Audio': [ JS, /new AudioContext\(/ ],
	AnalyserNode: [ JS, /createAnalyser\(/ ],
	'Page Visibility': [ JS, /visibilitychange|document\.hidden/ ],
	'Lazy loading': [ ALL, /loading="lazy"/ ],
	'Async decoding': [ ALL, /decoding="async"/ ],
	'Pointer Events': [ JS, /pointerdown|setPointerCapture/ ],
	'Web Animations': [ JS, /\.animate\(/ ],
	requestAnimationFrame: [ JS, /requestAnimationFrame\(/ ],
	'Web Share': [ JS, /navigator\.share/ ],
	Clipboard: [ JS, /navigator\.clipboard/ ],
	inert: [ JS, /\.inert = / ],
	matchMedia: [ JS, /matchMedia\(/ ],
	scrollIntoView: [ JS, /scrollIntoView\(/ ],
	'ES modules': [ PHP, /wp_(enqueue|register)_script_module|type="module"/ ],
	'Dynamic import': [ JS, /\bimport\(/ ],
	History: [ JS, /pushState\(|popstate/ ],
	'Web Storage': [ JS, /sessionStorage|localStorage/ ],
	Fetch: [ JS, /\bfetch\(/ ],
	'Navigation Timing': [ JS, /getEntriesByType\( 'navigation' \)/ ],
	pagehide: [ JS, /'pagehide'/ ],
	pageshow: [ JS, /'pageshow'/ ],
	'ARIA dialog': [ PHP, /role="dialog"/ ],
	'@property': [ CSS, /@property/ ],
	'color-mix()': [ CSS, /color-mix\(/ ],
	'Container queries': [ CSS, /container-type|@container/ ],
	':has()': [ CSS, /:has\(/ ],
	'env() safe areas': [ CSS, /env\(safe-area/ ],
	'text-wrap': [ CSS, /text-wrap/ ],
	'Variable fonts': [ CSS, /font-weight: \d+ \d+/ ],
	'prefers-reduced-motion': [ CSS, /prefers-reduced-motion/ ],
	'prefers-reduced-transparency': [ CSS, /prefers-reduced-transparency/ ],
	'clip-path': [ CSS, /clip-path/ ],
	'aspect-ratio': [ CSS, /aspect-ratio/ ],
	'accent-color': [ CSS, /accent-color/ ],
	'touch-action': [ CSS, /touch-action/ ],
	'overscroll-behavior': [ CSS, /overscroll-behavior/ ],
	':focus-visible': [ CSS, /:focus-visible/ ],
};

function listed() {
	// The list is the Built on the open web page's, which is built from site/web/web.json.
	return JSON.parse( read( 'site/web/web.json' ) ).map( ( e ) => e.name );
}

test( 'every API the open web page lists is used by the plugin', () => {
	const names = listed();
	assert.ok( names.length >= 40, `the list is complete (${ names.length })` );
	const unknown = names.filter( ( n ) => ! USES[ n ] );
	assert.deepEqual( unknown, [], 'every listed name has a pattern here saying where it is used' );
	const unused = names.filter( ( n ) => ! USES[ n ][ 1 ].test( USES[ n ][ 0 ] ) );
	assert.deepEqual( unused, [], 'every listed API still appears in the code' );
} );

test( 'every pattern here is on the page, so the list and the code move together', () => {
	const names = new Set( listed() );
	const missing = Object.keys( USES ).filter( ( n ) => ! names.has( n ) );
	assert.deepEqual( missing, [], 'an API the code uses and this file knows is also listed on the page' );
} );
