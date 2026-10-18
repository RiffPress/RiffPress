/**
 * Riff Lyrics is the reference extension: it may use only what Riff documents, so a change to Riff
 * that would break a third-party plugin breaks it first. Every Riff hook it hooks, every riff:
 * event it listens to and every window.riff member it calls must be in the generated references,
 * and its PHP must not reach into Riff's classes. Run by `node --test .github/scripts/*.test.js`.
 */
const assert = require( 'node:assert/strict' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { test } = require( 'node:test' );

const ROOT = path.resolve( __dirname, '..', '..' );
const DIR = path.join( ROOT, 'plugins', 'riff-lyrics' );
const read = ( file ) => fs.readFileSync( file, 'utf8' );
const files = ( dir, ext ) =>
	fs.readdirSync( dir, { withFileTypes: true } ).flatMap( ( d ) => {
		const full = path.join( dir, d.name );
		if ( d.isDirectory() ) {
			return d.name === 'tests' ? [] : files( full, ext );
		}
		return full.endsWith( ext ) ? [ full ] : [];
	} );

const HOOKS = read( path.join( ROOT, 'docs', 'hooks.md' ) );
const JS = read( path.join( ROOT, 'docs', 'javascript.md' ) );
const PHP = files( DIR, '.php' ).map( read ).join( '\n' );
const SCRIPT = files( DIR, '.js' ).map( read ).join( '\n' );

test( 'every Riff PHP hook it uses is documented', () => {
	const used = [ ...PHP.matchAll( /add_(?:filter|action)\(\s*'(riff_[a-z_]+)'/g ) ].map( ( m ) => m[ 1 ] );
	assert.ok( used.length, 'it hooks into Riff' );
	for ( const hook of used ) {
		assert.ok( HOOKS.includes( `\`${ hook }\`` ), `${ hook } is not in docs/hooks.md` );
	}
} );

test( 'every riff: event and window.riff member it uses is documented', () => {
	const events = [ ...SCRIPT.matchAll( /'riff:([a-z]+)'/g ) ].map( ( m ) => m[ 1 ] );
	assert.ok( events.length, 'it listens to the player' );
	for ( const name of events ) {
		assert.ok( HOOKS.includes( `\`riff.${ name }\`` ), `riff.${ name } is not in docs/hooks.md` );
	}
	for ( const [ , member ] of SCRIPT.matchAll( /window\.riff\.([a-zA-Z]+)/g ) ) {
		assert.ok( JS.includes( `window.riff.${ member }` ), `window.riff.${ member } is not in docs/javascript.md` );
	}
} );

test( 'its PHP reaches no Riff class but its own', () => {
	const reached = [ ...PHP.matchAll( /\bRiff\\([A-Za-z_\\]+)/g ) ]
		.map( ( m ) => m[ 1 ] )
		.filter( ( name ) => ! name.startsWith( 'Lyrics' ) );
	assert.deepEqual( reached, [], 'use hooks and REST, not Riff\'s classes' );
} );
