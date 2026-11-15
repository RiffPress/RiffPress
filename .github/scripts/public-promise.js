#!/usr/bin/env node
/**
 * Holds Riff to the promise in .github/SUPPORT.md: within a major version, a public name keeps its
 * name and its shape, and anything that has to go is deprecated first, with a note.
 *
 * It compares what is public now with what the last published release (the highest riff-v* tag)
 * made public:
 *
 * - hooks, from docs/hooks.md: each keeps its kind and at least its parameters;
 * - window.riff members, from docs/javascript.md: each keeps at least its parameters;
 * - PHP functions in src/functions.php: each keeps its parameters, and asks for no more;
 * - REST routes, from surface.php: each public route keeps its methods and its arguments' types,
 *   and needs no argument it did not need; the internal ones (riff_internal) are left out;
 * - CSS custom properties in tokens.css with a docblock: each keeps its name.
 *
 * A name that changes shape passes only when it is deprecated (`apply_filters_deprecated()`,
 * `do_action_deprecated()`, `_deprecated_function()` or a `@deprecated` tag, a route's
 * `riff_deprecated`) and docs/deprecations.md names it. A name that goes passes only when the
 * release had it deprecated, this is a new major version, and docs/deprecations.md names it. A name
 * deprecated since the release needs its note too.
 *
 * Usage: node .github/scripts/public-promise.js [tag]
 */
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { execFileSync } = require( 'node:child_process' );

const ROOT = path.resolve( __dirname, '..', '..' );
const NOTES = 'docs/deprecations.md';
// What the base release's surface is read from, extracted from its tag.
const PATHS = [ 'docs/hooks.md', 'docs/javascript.md', 'plugins/riff/src', 'plugins/riff/features', 'plugins/riff/assets/tokens.css', '.github/scripts/surface.php' ];

// The parameter names in `name( a, b = 1, ...c )`, each with whether it may be left out.
function paramsOf( list ) {
	const parts = [];
	let depth = 0;
	let at = 0;
	// Split at the commas between parameters, not those inside a default such as array( 1, 2 ).
	for ( let i = 0; i <= list.length; i++ ) {
		const c = list[ i ];
		if ( c === '(' || c === '[' || c === '{' ) {
			depth++;
		} else if ( c === ')' || c === ']' || c === '}' ) {
			depth--;
		} else if ( ( c === ',' && ! depth ) || i === list.length ) {
			parts.push( list.slice( at, i ).trim() );
			at = i + 1;
		}
	}
	return parts.filter( Boolean ).map( ( p ) => ( { name: p.replace( /=.*$/, '' ).trim().split( /\s+/ ).pop(), optional: /=|\.{3}/.test( p ) } ) );
}

/**
 * The hooks in docs/hooks.md, by kind and name: filter or action, their parameters, and whether deprecated.
 *
 * @param {string} md The file.
 * @return {Object} Entries by name.
 */
function hooksFrom( md ) {
	const out = {};
	let type = '';
	let current = null;
	for ( const line of md.split( '\n' ) ) {
		const heading = /^(#{2,4}) (.*)$/.exec( line );
		if ( heading ) {
			const name = /^`([^`]+)`$/.exec( heading[ 2 ] );
			if ( name ) {
				// By kind and name: riff.queue is a JavaScript filter and an action.
				current = out[ `${ type } ${ name[ 1 ] }` ] = { kind: 'hook', name: name[ 1 ], type, params: [], deprecated: false };
				continue;
			}
			current = null;
			if ( /filters/i.test( heading[ 2 ] ) ) {
				type = 'filter';
			} else if ( /actions/i.test( heading[ 2 ] ) ) {
				type = 'action';
			}
			continue;
		}
		if ( ! current ) {
			continue;
		}
		const row = /^\| `([^`]+)` \|/.exec( line );
		// A dotted name is a property of the parameter before it, not a parameter of its own.
		if ( row && row[ 1 ] !== 'Parameter' && ! row[ 1 ].replace( /^\$/, '' ).includes( '.' ) ) {
			current.params.push( { name: row[ 1 ], optional: false } );
		} else if ( /^Deprecated\./.test( line ) ) {
			current.deprecated = true;
		}
	}
	return out;
}

/**
 * The window.riff members in docs/javascript.md, by name, with their parameters.
 *
 * @param {string} md The file.
 * @return {Object} Entries by name.
 */
function membersFrom( md ) {
	const out = {};
	let current = null;
	for ( const line of md.split( '\n' ) ) {
		const m = /^### `(window\.riff\.\w+)(?:\((.*)\))?`$/.exec( line );
		if ( m ) {
			current = out[ m[ 1 ] ] = { kind: 'member', name: m[ 1 ], params: m[ 2 ] === undefined ? [] : paramsOf( m[ 2 ] ), deprecated: false };
		} else if ( /^## /.test( line ) ) {
			current = null;
		} else if ( current && /^Deprecated\./.test( line ) ) {
			current.deprecated = true;
		}
	}
	return out;
}

/**
 * The functions in src/functions.php, by name, as `name()`, with their parameters.
 *
 * @param {string} php The file.
 * @return {Object} Entries by name.
 */
function functionsFrom( php ) {
	const out = {};
	const lines = php.split( '\n' );
	lines.forEach( ( line, i ) => {
		const m = /^function\s+&?(\w+)\s*\((.*)\)/.exec( line );
		if ( ! m ) {
			return;
		}
		// Its docblock above, and its body down to the closing brace.
		let start = i;
		while ( start > 0 && /^\s*(\/\*\*|\*)/.test( lines[ start - 1 ] ) ) {
			start--;
		}
		let end = i;
		while ( end < lines.length - 1 && ! /^}/.test( lines[ end ] ) ) {
			end++;
		}
		const text = lines.slice( start, end + 1 ).join( '\n' );
		out[ `${ m[ 1 ] }()` ] = {
			kind: 'function',
			name: `${ m[ 1 ] }()`,
			params: paramsOf( m[ 2 ] ),
			deprecated: /@deprecated\b|_deprecated_function\(/.test( text ),
		};
	} );
	return out;
}

/**
 * The public custom properties in tokens.css: each with a docblock directly above it.
 *
 * @param {string} css The file.
 * @return {Object} Entries by name.
 */
function propertiesFrom( css ) {
	const out = {};
	const lines = css.split( '\n' );
	lines.forEach( ( line, i ) => {
		const m = /^\s*(--riff-[\w-]+)\s*:/.exec( line );
		if ( ! m || out[ m[ 1 ] ] || ! /\*\/\s*$/.test( lines[ i - 1 ] || '' ) ) {
			return;
		}
		let k = i - 1;
		while ( k > 0 && ! /\/\*/.test( lines[ k ] ) ) {
			k--;
		}
		if ( /\/\*\*/.test( lines[ k ] ) ) {
			out[ m[ 1 ] ] = { kind: 'property', name: m[ 1 ], deprecated: /@deprecated\b/.test( lines.slice( k, i ).join( '\n' ) ) };
		}
	} );
	return out;
}

/**
 * The public routes surface.php reports, by address, with their methods and arguments.
 *
 * @param {Array} routes surface.php's routes.
 * @return {Object} Entries by address.
 */
function routesFrom( routes ) {
	const out = {};
	for ( const r of routes.filter( ( x ) => ! x.internal ) ) {
		const name = `/${ r.namespace }${ r.route.replace( /\(\?P<(\w+)>[^)]+\)/g, '{$1}' ) }`;
		// Each method with its own arguments: a POST added beside a GET asks nothing of the GET.
		const methods = {};
		for ( const e of r.endpoints || [] ) {
			const args = {};
			for ( const [ arg, schema ] of Object.entries( e.args || {} ) ) {
				args[ arg ] = { type: JSON.stringify( schema.type ?? null ), required: !! schema.required };
			}
			for ( const m of String( e.methods ).split( /[\s,]+/ ).filter( Boolean ) ) {
				methods[ m ] = args;
			}
		}
		out[ name ] = { kind: 'route', name, methods, deprecated: !! r.deprecated };
	}
	return out;
}

/**
 * How the head's entry breaks what the base's promised, or an empty string.
 *
 * @param {Object} base The release's entry.
 * @param {Object} head This tree's entry.
 * @return {string} Why it breaks.
 */
function broken( base, head ) {
	if ( base.kind === 'hook' && base.type && head.type && base.type !== head.type ) {
		return `was a ${ base.type }, is now a ${ head.type }`;
	}
	if ( base.params ) {
		const names = ( list ) => list.map( ( p ) => p.name ).join( ', ' );
		if ( head.params.length < base.params.length ) {
			return `took ( ${ names( base.params ) } ), now takes ( ${ names( head.params ) } )`;
		}
		const asks = head.params.filter( ( p, i ) => ! p.optional && ( i >= base.params.length || base.params[ i ].optional ) );
		// Only PHP refuses a call short of a parameter; a hook's callback or a window.riff member
		// handed one more is not broken by it.
		if ( base.kind === 'function' && asks.length ) {
			return `now needs ${ names( asks ) }`;
		}
	}
	for ( const [ method, args ] of Object.entries( base.methods || {} ) ) {
		const now = head.methods[ method ];
		if ( ! now ) {
			return `no longer answers ${ method }`;
		}
		for ( const [ arg, a ] of Object.entries( args ) ) {
			if ( ! now[ arg ] ) {
				return `no longer takes ${ arg } on ${ method }`;
			}
			if ( now[ arg ].type !== a.type ) {
				return `takes ${ arg } on ${ method } as ${ now[ arg ].type }, not ${ a.type }`;
			}
		}
		const needs = Object.entries( now ).filter( ( [ arg, a ] ) => a.required && ! args[ arg ]?.required );
		if ( needs.length ) {
			return `now needs ${ needs.map( ( [ arg ] ) => arg ).join( ', ' ) } on ${ method }`;
		}
	}
	return '';
}

/**
 * What breaks the promise between a release's surface and this tree's.
 *
 * @param {Object} base         The release's entries, by kind, then by name.
 * @param {Object} head         This tree's.
 * @param {Object} context
 * @param {string} context.notes     docs/deprecations.md.
 * @param {number} context.baseMajor The release's major version.
 * @param {number} context.headMajor This tree's.
 * @return {string[]} Problems.
 */
function compare( base, head, { notes = '', baseMajor = 0, headMajor = 0 } = {} ) {
	const out = [];
	const noted = ( name ) => notes.includes( `\`${ name }\`` );
	const say = ( name, words ) => out.push( `${ name } ${ words }` );
	for ( const kind of Object.keys( base ) ) {
		for ( const [ key, b ] of Object.entries( base[ kind ] ) ) {
			const h = head[ kind ]?.[ key ];
			const name = b.kind === 'hook' ? `The ${ b.type } ${ b.name }` : b.name;
			if ( ! h ) {
				if ( ! b.deprecated ) {
					say( name, `is gone without a deprecation: deprecate it in one release, and remove it in the next major version` );
				} else if ( headMajor <= baseMajor ) {
					say( name, `is gone in ${ headMajor }.x: a deprecated name is removed only in the next major version` );
				} else if ( ! noted( b.name ) ) {
					say( name, `is gone with no note in ${ NOTES }` );
				}
				continue;
			}
			const why = broken( b, h );
			if ( why && ! ( b.deprecated || h.deprecated ) ) {
				say( name, `${ why }, without a deprecation` );
			} else if ( why && ! noted( b.name ) ) {
				say( name, `${ why }, with no note in ${ NOTES }` );
			} else if ( h.deprecated && ! b.deprecated && ! noted( b.name ) ) {
				say( name, `is deprecated with no note in ${ NOTES }` );
			}
		}
	}
	return out;
}

/**
 * A tree's public surface.
 *
 * @param {string} root The tree.
 * @return {Object} Entries by kind, then by name.
 */
function snapshot( root ) {
	const read = ( file ) => ( fs.existsSync( path.join( root, file ) ) ? fs.readFileSync( path.join( root, file ), 'utf8' ) : '' );
	const surface = JSON.parse( execFileSync( 'php', [ path.join( root, '.github', 'scripts', 'surface.php' ) ], { encoding: 'utf8' } ) );
	return {
		hooks: hooksFrom( read( 'docs/hooks.md' ) ),
		members: membersFrom( read( 'docs/javascript.md' ) ),
		functions: functionsFrom( read( 'plugins/riff/src/functions.php' ) ),
		properties: propertiesFrom( read( 'plugins/riff/assets/tokens.css' ) ),
		routes: routesFrom( surface.routes ),
	};
}

/** The last published release: the highest riff-v* tag. */
function lastRelease() {
	const tags = execFileSync( 'git', [ 'tag', '--list', 'riff-v*', '--sort=-v:refname' ], { cwd: ROOT, encoding: 'utf8' } ).trim();
	return tags.split( '\n' )[ 0 ] || '';
}

// The tag's files, in a directory of their own.
function extract( tag ) {
	const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'riff-promise-' ) );
	const present = PATHS.filter( ( p ) => {
		try {
			execFileSync( 'git', [ 'cat-file', '-e', `${ tag }:${ p }` ], { cwd: ROOT, stdio: 'ignore' } );
			return true;
		} catch {
			return false;
		}
	} );
	// Not git archive, which leaves out what .gitattributes marks export-ignore, .github among it.
	const files = execFileSync( 'git', [ 'ls-tree', '-r', '--name-only', tag, '--', ...present ], { cwd: ROOT, encoding: 'utf8' } ).split( '\n' ).filter( Boolean );
	const blobs = execFileSync( 'git', [ 'cat-file', '--batch' ], { cwd: ROOT, input: files.map( ( f ) => `${ tag }:${ f }` ).join( '\n' ) + '\n', maxBuffer: 1 << 28 } );
	let at = 0;
	for ( const file of files ) {
		const end = blobs.indexOf( 10, at );
		const size = Number( blobs.toString( 'utf8', at, end ).split( ' ' )[ 2 ] );
		fs.mkdirSync( path.dirname( path.join( dir, file ) ), { recursive: true } );
		fs.writeFileSync( path.join( dir, file ), blobs.subarray( end + 1, end + 1 + size ) );
		at = end + 1 + size + 1;
	}
	return dir;
}

function main() {
	const tag = process.argv[ 2 ] || lastRelease();
	if ( ! tag ) {
		// A clone without tags cannot be compared; CI fetches them, so there it is an error.
		console.log( 'public-promise: no riff-v* tag here to compare with (git fetch --tags)' );
		process.exit( process.env.CI ? 1 : 0 );
	}
	const dir = extract( tag );
	try {
		const major = ( v ) => Number( String( v ).replace( /^riff-v/, '' ).split( '.' )[ 0 ] );
		const manifest = JSON.parse( fs.readFileSync( path.join( ROOT, '.release-please-manifest.json' ), 'utf8' ) );
		const base = snapshot( dir );
		const head = snapshot( ROOT );
		const found = compare( base, head, {
			notes: fs.existsSync( path.join( ROOT, NOTES ) ) ? fs.readFileSync( path.join( ROOT, NOTES ), 'utf8' ) : '',
			baseMajor: major( tag ),
			headMajor: major( manifest[ 'plugins/riff' ] ),
		} );
		if ( found.length ) {
			console.error( `The public surface breaks what ${ tag } promised (.github/SUPPORT.md):` );
			found.forEach( ( p ) => console.error( `  ${ p }` ) );
			process.exit( 1 );
		}
		const count = ( s ) => Object.values( s ).reduce( ( n, k ) => n + Object.keys( k ).length, 0 );
		console.log( `The public surface keeps what ${ tag } promised (${ count( base ) } names then, ${ count( head ) } now)` );
	} finally {
		fs.rmSync( dir, { recursive: true, force: true } );
	}
}

if ( require.main === module ) {
	main();
}

module.exports = { hooksFrom, membersFrom, functionsFrom, propertiesFrom, routesFrom, broken, compare, paramsOf };
