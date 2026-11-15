/**
 * The JavaScript reference reads window.riff the way the player defines it.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { members, problems, page, call, render } = require( './js-reference.js' );
const promise = require( './public-promise.js' );

const tmp = ( body ) => {
	const file = path.join( fs.mkdtempSync( path.join( os.tmpdir(), 'riff-js-' ) ), 'riff.js' );
	fs.writeFileSync( file, body );
	return file;
};

test( 'reads properties and methods, shorthand and arrow, with their parameters', () => {
	const list = members( tmp( `( () => {
	const api = {
		/**
		 * The version.
		 *
		 * @since 4.0.0
		 *
		 * @type {number}
		 */
		version: 1,
		/**
		 * Plays.
		 *
		 * @since 4.0.0
		 *
		 * @param {Object[]} tracks    Tracks.
		 * @param {number}   [index=0] First.
		 */
		play( tracks, index = 0 ) {
			setQueue( tracks, index );
		},
		/**
		 * Skips.
		 *
		 * @since 4.0.0
		 */
		next: () => next(),
		/**
		 * The queue.
		 *
		 * @since 4.0.0
		 *
		 * @return {Object[]} Tracks.
		 */
		queue: () => order.map( ( i ) => queue[ i ] ),
	};
} )();
` ) );
	assert.deepEqual( list.map( ( m ) => [ m.name, m.kind, m.arity ] ), [ [ 'version', 'property', 0 ], [ 'play', 'method', 2 ], [ 'next', 'method', 0 ], [ 'queue', 'method', 0 ] ] );
	assert.deepEqual( problems( list ), [] );
	assert.equal( call( list[ 1 ] ), 'window.riff.play( tracks, index = 0 )' );
	assert.equal( list[ 3 ].returns.type, 'Object[]' );
	assert.equal( list[ 0 ].typeTag, 'number' );
} );

test( 'the check refuses an undocumented member, a missing @param, and a property without @type', () => {
	const list = members( tmp( `
	const api = {
		strings: s,
		/**
		 * Seeks.
		 *
		 * @since 4.0.0
		 */
		seek( seconds ) {},
		/**
		 * A count.
		 *
		 * @since 4.0.0
		 */
		count: 3,
	};
` ) );
	const found = problems( list );
	assert.equal( found.length, 3 );
	assert.match( found[ 0 ], /window\.riff\.strings .* has no docblock/ );
	assert.match( found[ 1 ], /window\.riff\.seek .* takes 1 parameter but documents 0 @param/ );
	assert.match( found[ 2 ], /window\.riff\.count .* is a property without a @type/ );
} );

test( 'every member of the real window.riff is documented, and the page lists each one', () => {
	const list = members();
	assert.ok( list.length > 10 );
	assert.deepEqual( problems( list ), [] );
	const html = page( list, [] );
	for ( const m of list ) {
		assert.ok( html.includes( `id="${ m.kind }-${ m.name.toLowerCase() }"` ), m.name );
	}
	assert.match( html, /<a href="\.\.\/\.\.\/developers\/javascript\/" aria-current="page">JavaScript<\/a>/ );
	assert.match( html, />PHP<\/a>.*>JavaScript<\/a>.*>REST API<\/a>.*>CSS<\/a>.*>How the player works<\/a>/, 'the bar lists every language, then the guides' );
} );

test( 'a @deprecated member says so in docs/javascript.md, where public-promise.js reads it', () => {
	const list = members( tmp( `( () => {
	const api = {
		/**
		 * Sets the speed.
		 *
		 * @since 4.0.0
		 * @deprecated 6.19.0 Use window.riff.rate().
		 *
		 * @param {number} rate The rate.
		 */
		speed( rate ) {
			return rate;
		},
	};
	window.riff = api;
} )();
` ) );
	const md = render( list, [] );
	assert.match( md, /\nDeprecated\. 6\.19\.0 Use window\.riff\.rate\(\)\.\n/ );
	assert.equal( promise.membersFrom( md )[ 'window.riff.speed' ].deprecated, true );
} );
