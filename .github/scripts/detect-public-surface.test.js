'use strict';

const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );

const findSurfaces = require( './detect-public-surface.js' );
const {
	newSurfaces,
	ownConstants,
	formatAudit,
	formatComment,
	isScanned,
	MARKER,
} = findSurfaces;

const ids = ( surfaces ) => surfaces.map( ( s ) => s.id );
const php = ( source ) =>
	ids( findSurfaces( source, 'includes/class-frontend.php' ) );
const js = ( source ) => ids( findSurfaces( source, 'assets/app.js' ) );
const surface = ( id, documented = false ) => ( { id, documented } );

// ---------------------------------------------------------------------------
// PHP hooks
// ---------------------------------------------------------------------------

test( 'reads filters and actions apart', () => {
	assert.deepEqual( php( "apply_filters( 'riff_app_data', 30 );" ), [
		'filter:riff_app_data',
	] );
	assert.deepEqual( php( "do_action( 'riff_call_published' );" ), [
		'action:riff_call_published',
	] );
} );

test( 'reads the _ref_array and _deprecated variants', () => {
	assert.deepEqual(
		php(
			"apply_filters_ref_array( 'a', $x ); do_action_deprecated( 'b', $y, '1.0' );"
		),
		[ 'filter:a', 'action:b' ]
	);
} );

test( 'keeps an interpolated hook name whole', () => {
	assert.deepEqual( php( 'do_action( "riff_{$slug}_imported" );' ), [
		'action:riff_{$slug}_imported',
	] );
} );

// ---------------------------------------------------------------------------
// Constants, REST, CLI
// ---------------------------------------------------------------------------

test( 'counts a guarded constant, ignores a bare define and core guards', () => {
	const source = `
    if ( ! defined( 'ABSPATH' ) ) {
      exit;
    }
    if ( ! defined( 'RIFF_CACHE_TTL' ) ) {
      define( 'RIFF_CACHE_TTL', 30 );
    }
    define( 'RIFF_INTERNAL', 5 );
  `;
	assert.deepEqual( php( source ), [ 'constant:RIFF_CACHE_TTL' ] );
} );

test( 'counts a constant the plugin only ever reads', () => {
	// Nothing here defines it: a site sets it in `wp-config.php` or it stays
	// undefined, which is what makes the name a promise in the first place.
	const source = `
    if ( defined( 'RIFF_DISABLE_OFFLINE' ) && RIFF_DISABLE_OFFLINE ) {
      return;
    }
  `;
	assert.deepEqual( php( source ), [ 'constant:RIFF_DISABLE_OFFLINE' ] );
} );

test( "a name outside the plugin's prefix is still the plugin's promise", () => {
	assert.deepEqual( php( "if ( defined( 'RIFF_DEBUG' ) ) {}" ), [
		'constant:RIFF_DEBUG',
	] );
} );

test( "core constants are WordPress's promise, in either form", () => {
	const source = `
    if ( ! defined( 'ABSPATH' ) ) {
      exit;
    }
    if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
      exit;
    }
    if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {}
    if ( defined( 'WP_CLI' ) && WP_CLI ) {}
    if ( defined( 'REST_REQUEST' ) && REST_REQUEST ) {}
  `;
	assert.deepEqual( php( source ), [] );
} );

test( 'a constant defined outright stays internal, however often it is read', () => {
	const source = `
    define( 'RIFF_MAX_SUBSCRIBERS', 191 );
    if ( defined( 'RIFF_MAX_SUBSCRIBERS' ) ) {
      $max = RIFF_MAX_SUBSCRIBERS;
    }
  `;
	assert.deepEqual( php( source ), [] );
} );

test( 'a guarded define and a read of it are the one surface', () => {
	const source = `
    if ( ! defined( 'RIFF_CACHE_TTL' ) ) {
      define( 'RIFF_CACHE_TTL', 150 );
    }
    if ( defined( 'RIFF_CACHE_TTL' ) && RIFF_CACHE_TTL ) {
      $ttl = RIFF_CACHE_TTL;
    }
  `;
	assert.deepEqual(
		ids(
			newSurfaces(
				[],
				findSurfaces( source, 'includes/class-frontend.php' )
			)
		),
		[ 'constant:RIFF_CACHE_TTL' ]
	);
} );

test( 'a docblock above the read documents the constant', () => {
	const [ read ] = findSurfaces(
		`/**
 * Whether offline saving is switched off for the whole site.
 */
if ( defined( 'RIFF_DISABLE_OFFLINE' ) && RIFF_DISABLE_OFFLINE ) {}`,
		'includes/class-frontend.php'
	);
	assert.equal( read.id, 'constant:RIFF_DISABLE_OFFLINE' );
	assert.equal( read.documented, true );
} );

test( '@access private withdraws a constant the same way', () => {
	const source = `/**
 * Internal kill switch.
 *
 * @since 0.1.0
 * @access private
 */
if ( defined( 'RIFF_INTERNAL_OFF' ) && RIFF_INTERNAL_OFF ) {}`;
	assert.deepEqual( php( source ), [] );
	assert.deepEqual( php( source.replace( ' * @access private\n', '' ) ), [
		'constant:RIFF_INTERNAL_OFF',
	] );
} );

test( 'the core list covers the constants a plugin actually guards on', () => {
	const source = `
    if ( defined( 'SHORTINIT' ) && SHORTINIT ) {}
    if ( defined( 'WP_USE_THEMES' ) && WP_USE_THEMES ) {}
    if ( defined( 'WP_ALLOW_REPAIR' ) && WP_ALLOW_REPAIR ) {}
    if ( defined( 'WP_AUTO_UPDATE_CORE' ) ) {}
    if ( defined( 'DISALLOW_FILE_MODS' ) && DISALLOW_FILE_MODS ) {}
    if ( defined( 'DAY_IN_SECONDS' ) ) {}
    if ( defined( 'DB_HOST' ) ) {}
    if ( defined( 'COOKIEHASH' ) ) {}
    if ( defined( 'SUNRISE' ) && SUNRISE ) {}
  `;
	assert.deepEqual( php( source ), [] );
} );

test( "a constant defined in one file is the plugin's own in every other", () => {
	const bootstrap = "define( 'RIFF_MAX_SUBSCRIBERS', 191 );";
	const reader = "if ( defined( 'RIFF_MAX_SUBSCRIBERS' ) ) {}";

	// Alone, the reading file cannot tell an internal from a promise.
	assert.deepEqual( php( reader ), [ 'constant:RIFF_MAX_SUBSCRIBERS' ] );

	// Weighed with the file that defines it, the way the CLI weighs a whole ref.
	const own = ownConstants( [ bootstrap, reader ] );
	assert.deepEqual(
		ids( findSurfaces( reader, 'includes/class-frontend.php', own ) ),
		[]
	);
} );

test( 'a guard anywhere in the ref keeps the constant settable', () => {
	const bootstrap = `if ( ! defined( 'RIFF_CACHE_TTL' ) ) {
      define( 'RIFF_CACHE_TTL', 150 );
    }`;
	const reader = "if ( defined( 'RIFF_CACHE_TTL' ) ) {}";
	const own = ownConstants( [ bootstrap, reader ] );

	assert.deepEqual(
		ids( findSurfaces( reader, 'includes/class-frontend.php', own ) ),
		[ 'constant:RIFF_CACHE_TTL' ]
	);
} );

test( 'a private declaration stays private where the constant is read again', () => {
	const source = `/**
 * Internal kill switch.
 *
 * @since 0.1.0
 * @access private
 */
if ( ! defined( 'RIFF_INTERNAL' ) ) {
	define( 'RIFF_INTERNAL', 5 );
}

if ( defined( 'RIFF_INTERNAL' ) && RIFF_INTERNAL ) {
	return;
}`;
	assert.deepEqual( php( source ), [] );
} );

test( 'reads a route through a variable namespace', () => {
	assert.deepEqual(
		php( "register_rest_route( $this->namespace, '/board', array() );" ),
		[ 'rest:/board' ]
	);
} );

test( 'reads a concatenated route whole, not just its first literal', () => {
	const source = `register_rest_route(
    $this->namespace,
    '/' . $this->rest_base . '/rooms',
    array()
  );`;
	assert.deepEqual( php( source ), [ 'rest:/$this->rest_base/rooms' ] );
} );

test( 'reads a CLI command', () => {
	assert.deepEqual( php( "WP_CLI::add_command( 'riff', $class );" ), [
		'cli:riff',
	] );
} );

// ---------------------------------------------------------------------------
// JavaScript
// ---------------------------------------------------------------------------

test( 'reads a browser global the script assigns', () => {
	assert.deepEqual( js( 'window.RIFF_createDeck = function () {};' ), [
		'js-global:window.RIFF_createDeck',
	] );
} );

test( 'a comparison against a global is not a declaration', () => {
	assert.deepEqual( js( 'if ( window.RIFF_thing === undefined ) {}' ), [] );
} );

test( 'reads wp.hooks calls', () => {
	assert.deepEqual( js( "wp.hooks.applyFilters( 'riff.track', x );" ), [
		'js-filter:riff.track',
	] );
} );

test( 'reads the extension API global', () => {
	assert.deepEqual( js( 'window.riff = riff;' ), [
		'js-global:window.riff',
	] );
} );

test( 'an extension id reads the same from PHP and from the script', () => {
	const fromPhp = php(
		"riff_register_extension( 'riff/quality', array() );"
	);
	const fromJs = js(
		"cb.registerExtension( 'riff/quality', { apiVersion: 1 } );"
	);
	assert.deepEqual( fromPhp, [ 'extension:riff/quality' ] );
	assert.deepEqual( fromJs, fromPhp );
	assert.deepEqual(
		newSurfaces(
			[ surface( 'extension:riff/quality', true ) ],
			findSurfaces(
				"cb.registerExtension( 'riff/quality', {} );",
				'assets/app.js'
			)
		),
		[]
	);
} );

test( 'reads the slots a template prints', () => {
	const source =
		"<?php riff_slot( 'track_badges', $t, $set ); ?><?php echo riff_get_slot( 'track_meta', $t ); ?>";
	assert.deepEqual(
		ids( findSurfaces( source, 'plugins/riff/templates/player.php' ) ),
		[ 'slot:track_badges', 'slot:track_meta' ]
	);
	assert.ok( isScanned( 'plugins/riff/templates/player.php' ) );
} );

test( 'the contract version counts, though the plugin defines it outright', () => {
	assert.deepEqual( php( "define( 'RIFF_API_VERSION', 1 );" ), [
		'contract:RIFF_API_VERSION',
	] );
	assert.deepEqual( php( "define( 'RIFF_VERSION', '2.2.0' );" ), [] );
} );

test( 'php rules do not run against a js file, or the reverse', () => {
	assert.deepEqual( js( "apply_filters( 'not_php', 1 );" ), [] );
	assert.deepEqual( php( 'window.RIFF_thing = 1;' ), [] );
} );

// ---------------------------------------------------------------------------
// @private
// ---------------------------------------------------------------------------

test( 'a @private docblock keeps an internal seam out', () => {
	const source = `/**
 * Builds an avatar stack.
 *
 * @private
 */
window.RIFF_buildWaveform = function ( users, max ) {};`;
	assert.deepEqual( js( source ), [] );
	assert.deepEqual( js( source.replace( ' * @private\n', '' ) ), [
		'js-global:window.RIFF_buildWaveform',
	] );
} );

test( '@private applies to the statement it documents, not the next one', () => {
	const source = `/**
 * @private
 */
window.RIFF_internal = function () {};
window.RIFF_public = function () {};`;
	assert.deepEqual( js( source ), [ 'js-global:window.RIFF_public' ] );
} );

test( '@access private withdraws a surface the same way', () => {
	const source = `/**
 * Fires internally.
 *
 * @since 0.1.0
 * @access private
 */
do_action( 'riff_internal' );`;
	assert.deepEqual( php( source ), [] );
	assert.deepEqual( php( source.replace( ' * @access private\n', '' ) ), [
		'action:riff_internal',
	] );
} );

test( '@private reads the same above a php hook', () => {
	const source = `/**
 * Fires internally.
 *
 * @private
 */
do_action( 'riff_internal' );`;
	assert.deepEqual( php( source ), [] );
} );

// ---------------------------------------------------------------------------
// The documented bar
// ---------------------------------------------------------------------------

test( 'a docblock saying what the hook is for documents it, through the assignment', () => {
	const [ long ] = findSurfaces(
		`/**
 * Filters the default TTL.
 *
 * @since 0.1.0
 * @param int $ttl Seconds.
 */
$ttl = apply_filters( 'riff_app_data', 30 );`,
		'includes/class-frontend.php'
	);
	const [ short ] = findSurfaces(
		"/** Filters the TTL. */\napply_filters( 'a', 1 );",
		'includes/class-frontend.php'
	);
	assert.equal( long.documented, true );
	assert.equal( short.documented, true );
} );

test( 'tags with no sentence are a signature, not a write-up', () => {
	const [ tagged ] = findSurfaces(
		"/**\n * @since 0.1.0\n */\napply_filters( 'a', 1 );",
		'includes/class-frontend.php'
	);
	const [ bare ] = findSurfaces(
		"apply_filters( 'a', 1 );",
		'includes/class-frontend.php'
	);
	assert.equal( tagged.documented, false );
	assert.equal( bare.documented, false );
} );

// ---------------------------------------------------------------------------
// newSurfaces
// ---------------------------------------------------------------------------

test( 'a hook moved to another file is not new', () => {
	// The identifier carries no path, so both sides collapse to the same entry.
	const base = findSurfaces( "apply_filters( 'a', 1 );", 'includes/one.php' );
	const head = findSurfaces( "apply_filters( 'a', 1 );", 'includes/two.php' );
	assert.deepEqual( newSurfaces( base, head ), [] );
} );

test( 'reports additions, ignores removals, and sorts', () => {
	const fresh = newSurfaces(
		[ surface( 'filter:a' ), surface( 'action:gone' ) ],
		[ surface( 'filter:a' ), surface( 'filter:c' ), surface( 'action:b' ) ]
	);
	assert.deepEqual( ids( fresh ), [ 'action:b', 'filter:c' ] );
} );

test( 'one write-up covers a hook fired from two places', () => {
	const [ only ] = newSurfaces(
		[],
		[ surface( 'filter:a' ), surface( 'filter:a', true ) ]
	);
	assert.equal( only.documented, true );
} );

// ---------------------------------------------------------------------------
// isScanned
// ---------------------------------------------------------------------------

test( 'scans shipped code only', () => {
	for ( const path of [
		'plugins/riff/src/class-player.php',
		'plugins/riff/riff.php',
		'plugins/riff/assets/riff.js',
	] ) {
		assert.equal( isScanned( path ), true, path );
	}
	// The tests are the loudest false-positive source: they call hooks
	// constantly without publishing any.
	for ( const path of [
		'plugins/riff/tests/e2e/player.spec.js',
		'plugins/riff/assets/riff.test.js',
		'packages/fixtures/seed.php',
		'.github/scripts/detect-public-surface.js',
	] ) {
		assert.equal( isScanned( path ), false, path );
	}
} );

// ---------------------------------------------------------------------------
// formatAudit
// ---------------------------------------------------------------------------

test( 'leads each entry with its kind and qualifies the undocumented ones', () => {
	const report = formatAudit( [
		surface( 'filter:riff_new_hook' ),
		surface( 'action:b', true ),
	] );
	assert.equal(
		report,
		'- (filter) `riff_new_hook` - *requires documentation*\n- (action) `b`'
	);
} );

test( 'splits on the first colon so a namespaced hook name survives', () => {
	assert.match(
		formatAudit( [ surface( 'js-filter:riff.track', true ) ] ),
		/\(js-filter\) `riff\.track`/
	);
} );

// ---------------------------------------------------------------------------
// formatComment
// ---------------------------------------------------------------------------

test( 'leads with the marker so the workflow can find its own comment', () => {
	assert.ok(
		formatComment( [ surface( 'filter:a' ) ] ).startsWith(
			`${ MARKER }\n### 🚩 New public surface\n`
		)
	);
} );

test( 'agrees in number', () => {
	const two = formatComment( [
		surface( 'filter:a', true ),
		surface( 'action:b', true ),
	] );
	assert.match( two, /^### 🚩 New public surfaces$/m );
} );
