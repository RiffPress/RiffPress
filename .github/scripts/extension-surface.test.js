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

test( 'it sets none of Riff\'s custom properties, and uses only the public ones from riff-tokens', () => {
	const code = PHP + '\n' + SCRIPT + '\n' + files( DIR, '.css' ).map( read ).join( '\n' );
	const set = [ ...code.matchAll( /(--riff-[\w-]+)\s*:/g ) ].map( ( m ) => m[ 1 ] );
	assert.deepEqual( set, [], 'a value of its own would drift from Riff\'s; use the token' );
	const tokens = read( path.join( ROOT, 'plugins', 'riff', 'assets', 'tokens.css' ) );
	const used = [ ...new Set( [ ...code.matchAll( /var\(\s*(--riff-[\w-]+)/g ) ].map( ( m ) => m[ 1 ] ) ) ];
	for ( const name of used ) {
		assert.match( tokens, new RegExp( `^\\s*${ name }\\s*:`, 'm' ), `${ name } is not a public token in tokens.css` );
	}
	assert.match( PHP, /array\(\s*'riff-tokens'\s*\)/, 'its stylesheet lists riff-tokens as a dependency' );
} );

// Each extension's Requires Riff is no older than the newest Riff surface it uses: every hook it
// hooks, riff: event it listens to and window.riff member it calls, by the "Since" each has in the
// generated references.
const since = ( doc, heading ) => {
	const at = doc.indexOf( heading );
	const m = at < 0 ? null : doc.slice( at, at + 1200 ).match( /Since (\d+\.\d+(?:\.\d+)?)/ );
	return m ? m[ 1 ] : null;
};
const newer = ( a, b ) => {
	const x = a.split( '.' ).map( Number );
	const y = b.split( '.' ).map( Number );
	for ( let i = 0; i < 3; i++ ) {
		if ( ( x[ i ] || 0 ) !== ( y[ i ] || 0 ) ) {
			return ( x[ i ] || 0 ) > ( y[ i ] || 0 );
		}
	}
	return false;
};
for ( const slug of [ 'riff-lyrics', 'riff-sign-in' ] ) {
	test( `${ slug }'s Requires Riff covers every Riff hook and API it uses`, () => {
		const dir = path.join( ROOT, 'plugins', slug );
		const header = read( path.join( dir, `${ slug }.php` ) ).match( /^ \* Requires Riff: *(\S+)/m );
		assert.ok( header, `${ slug }.php has no Requires Riff header` );
		const php = files( dir, '.php' ).map( read ).join( '\n' );
		const js = files( dir, '.js' ).map( read ).join( '\n' );
		const used = [
			...[ ...php.matchAll( /add_(?:filter|action)\(\s*'(riff_[a-z_]+)'/g ) ].map( ( m ) => [ HOOKS, `### \`${ m[ 1 ] }\`` ] ),
			...[ ...js.matchAll( /'riff:([a-z]+)'/g ) ].map( ( m ) => [ HOOKS, `#### \`riff.${ m[ 1 ] }\`` ] ),
			...[ ...js.matchAll( /(?:window\.riff|player\(\))\??\.([a-z]+)\b/g ) ].map( ( m ) => [ JS, `### \`window.riff.${ m[ 1 ] }` ] ),
		];
		let needed = '0.0.0';
		const unknown = [];
		for ( const [ doc, heading ] of used ) {
			const v = since( doc, heading );
			if ( ! v ) {
				unknown.push( heading );
			} else if ( newer( v, needed ) ) {
				needed = v;
			}
		}
		assert.deepEqual( unknown, [], 'every Riff surface it uses has a Since in the references' );
		assert.ok( ! newer( needed, header[ 1 ] ), `${ slug } uses Riff ${ needed } surface but says Requires Riff: ${ header[ 1 ] }` );
	} );
}
