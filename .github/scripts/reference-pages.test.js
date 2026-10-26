/**
 * The PHP, REST and CSS references read the code the way the plugin writes it.
 */
const { test } = require( 'node:test' );
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { collect, problems, site, customProperties, schemaRows } = require( './reference-pages.js' );

test( 'only a custom property with a docblock is public', () => {
	const file = path.join( fs.mkdtempSync( path.join( os.tmpdir(), 'riff-css-' ) ), 'riff.css' );
	fs.writeFileSync( file, `#riff {

	/**
	 * The background.
	 *
	 * @since 4.0.0
	 */
	--riff-bg: #000;
	/* stylelint-disable-next-line length-zero-no-unit -- calc() needs a length. */
	--riff-safe-b: env(safe-area-inset-bottom, 0px);
	--riff-heat: 0;
}
` );
	const list = customProperties( file );
	assert.deepEqual( list.map( ( p ) => [ p.name, p.value, p.selector, p.since ] ), [ [ '--riff-bg', '#000', '#riff', '4.0.0' ] ] );
} );

test( 'a schema flattens nested objects and arrays of objects', () => {
	const rows = schemaRows( { properties: { art: { type: 'array', items: { properties: { src: { type: 'string' } } } }, video: { type: [ 'object', 'null' ], properties: { poster: { type: 'string' } } } } } );
	assert.deepEqual( rows.map( ( r ) => [ r[ 0 ], r[ 1 ] ] ), [ [ 'art', 'array' ], [ 'art[].src', 'string' ], [ 'video', 'object | null' ], [ 'video.poster', 'string' ] ] );
} );

test( 'the plugin\'s PHP, REST and CSS surface is documented, and each page says so', () => {
	const data = collect();
	assert.deepEqual( problems( data ), [] );
	assert.equal( data.sourceMethods.map( ( m ) => m.name ).join( ',' ), 'id,supports,tracks,html,where' );
	assert.ok( data.surface.routes.some( ( r ) => r.route === '/library' ) );
	assert.ok( Object.keys( data.surface.track.properties ).includes( 'duration' ) );
	const pages = [ ...site( data ).values() ];
	const [ php, rest, css ] = pages;
	assert.match( php, /Riff\\Sources::register/ );
	for ( const name of Object.keys( data.surface.track.properties ) ) {
		assert.ok( php.includes( `<code>${ name }</code>` ), `the track schema lists ${ name }` );
	}
	assert.match( rest, /GET \/riff\/v1\/library\/\{id\}/ );
	assert.match( css, /--riff-accent<\/a><code>#f2eadb<\/code>/ );
	for ( const [ html, label ] of [ [ php, 'PHP' ], [ rest, 'REST API' ], [ css, 'CSS' ] ] ) {
		assert.match( html, new RegExp( `aria-current="true">${ label }</a>` ), `${ label } is current in the bar` );
	}
} );

test( 'the check refuses an undocumented Source method and a property without @since', () => {
	const data = collect();
	data.sourceMethods = [ { name: 'id', documented: false, params: [], arity: 0 } ];
	data.properties = [ { name: '--riff-x', documented: true, summary: 'X.', since: '' } ];
	const found = problems( data );
	assert.ok( found.some( ( p ) => /Riff\\Source::id\(\) has no docblock/.test( p ) ) );
	assert.ok( found.some( ( p ) => /--riff-x has no @since/.test( p ) ) );
} );
