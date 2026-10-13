/**
 * The hooks reference reads docblocks the way the plugin writes them.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { hooksIn, parse, render } = require( './hooks-reference.js' );

const tmp = ( body ) => {
	const file = path.join( fs.mkdtempSync( path.join( os.tmpdir(), 'riff-hooks-' ) ), 'class-x.php' );
	fs.writeFileSync( file, body );
	return file;
};

test( 'finds a documented filter with its since and parameters', () => {
	const file = tmp( `<?php
		/**
		 * Filters a track before the player reads it.
		 *
		 * @since 0.1.0
		 *
		 * @param array $track Track.
		 * @param int   $post_id Post ID.
		 */
		return (array) apply_filters( 'riff_track', $track, $post_id );
` );
	const [ hook ] = hooksIn( file );
	assert.equal( hook.name, 'riff_track' );
	assert.equal( hook.type, 'filter' );
	assert.equal( hook.since, '0.1.0' );
	assert.equal( hook.summary, 'Filters a track before the player reads it.' );
	assert.deepEqual( hook.params.map( ( p ) => p.name ), [ '$track', '$post_id' ] );
	assert.equal( hook.documented, true );
} );

test( 'an action without a docblock is still listed, marked undocumented', () => {
	const file = tmp( `<?php
		do_action( 'riff_before_player' );
` );
	const [ hook ] = hooksIn( file );
	assert.equal( hook.type, 'action' );
	assert.equal( hook.documented, false );
	assert.equal( hook.since, '' );
} );

test( 'a deprecated hook is flagged', () => {
	const file = tmp( `<?php
		/**
		 * Filters nothing now.
		 *
		 * @since 0.1.0
		 */
		apply_filters_deprecated( 'riff_old', array( 1 ), '0.2.0', 'riff_new' );
` );
	assert.equal( hooksIn( file )[ 0 ].deprecated, true );
} );

test( 'parse reads a summary that spans lines', () => {
	const parsed = parse( `/**
	 * Filters the data handed to the player script: strings, and the addresses of scripts a
	 * feature wants loaded.
	 *
	 * @since 0.1.0
	 *
	 * @param array $data Data.
	 */` );
	assert.equal( parsed.summary, 'Filters the data handed to the player script: strings, and the addresses of scripts a feature wants loaded.' );
} );

test( 'render sorts by name within filters and actions and writes a table per hook', () => {
	const md = render( [
		{ name: 'riff_b', type: 'filter', file: 'x.php', line: 2, summary: 'B.', since: '0.1.0', params: [ { type: 'array', name: '$b', description: 'B.' } ], documented: true },
		{ name: 'riff_a', type: 'filter', file: 'x.php', line: 1, summary: 'A.', since: '0.1.0', params: [], documented: true },
		{ name: 'riff_do', type: 'action', file: 'x.php', line: 3, summary: 'Fires.', since: '0.2.0', params: [], documented: true },
	] );
	assert.ok( md.indexOf( '### `riff_a`' ) < md.indexOf( '### `riff_b`' ) );
	assert.ok( md.indexOf( '## Filters' ) < md.indexOf( '## Actions' ) );
	assert.match( md, /\| `\$b` \| `array` \| B\. \|/ );
	assert.match( md, /Since 0\.2\.0\. Fires in `x\.php` at line 3\./ );
} );
