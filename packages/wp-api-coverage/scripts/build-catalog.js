#!/usr/bin/env node
/* eslint-disable no-console -- a command-line script; it talks. */
/**
 * Writes catalog/wordpress.json: every public function, class, action and filter in one WordPress
 * release, the JavaScript packages and script modules it ships, and the block supports its core
 * blocks declare.
 *
 * Everything comes from the release zip on downloads.wordpress.org, so the catalog matches exactly
 * one version of core. Bump PINNED and run the script to follow a new release.
 *
 * Usage: node scripts/build-catalog.js [--wordpress <version>] [--from <unzipped wordpress dir>]
 * Needs curl and unzip, unless --from points at an unzipped copy.
 * WP_API_COVERAGE_CACHE keeps the download between runs.
 */
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const crypto = require( 'node:crypto' );
const { execFileSync } = require( 'node:child_process' );
const { tokenize, hookName, docTags } = require( '../lib/php.js' );
const { areaOf, packageArea } = require( '../lib/areas.js' );
const { supportPaths } = require( '../lib/scan.js' );

const PINNED = '7.1.3';

// Third-party libraries core bundles: their classes are not WordPress APIs.
const VENDOR = /^wp-includes\/(SimplePie|Requests|ID3|PHPMailer|sodium_compat|IXR|Text|php-ai-client|js)\/|^wp-admin\/includes\/class-(pclzip|ftp)/;
// Functions that exist for one core block and are not meant to be called by plugins.
const BLOCK_INTERNALS = /^wp-includes\/blocks\/[^/]+\.php$|^wp-includes\/blocks\/[^/]+\/[^/]+\.php$/;
// Functions an admin screen or wp-login.php declares for itself; a plugin never has them loaded.
const SCREEN_FILES = /^[^/]+\.php$|^wp-admin\/[^/]+\.php$|^wp-admin\/(network|user)\/[^/]+\.php$/;
// Polyfills for PHP's own functions, like str_starts_with(): PHP's API, not WordPress's.
const POLYFILLS = /^wp-includes\/(compat|compat-utf8)\.php$/;
// One leading underscore marks a function or hook core keeps for itself. The translation functions (__, _e, _n, _x)
// and the __return_ helpers are the exceptions everyone calls.
const underscored = ( item ) => /^_(?!_)/.test( item.name ) && item.file !== 'wp-includes/l10n.php';
const DEPRECATED_FILES = /(^|\/)(ms-|pluggable-)?deprecated\.php$/;
const HOOK_FUNCTIONS = {
	do_action: 'action',
	do_action_ref_array: 'action',
	do_action_deprecated: 'action',
	apply_filters: 'filter',
	apply_filters_ref_array: 'filter',
	apply_filters_deprecated: 'filter',
};

function args() {
	const a = process.argv.slice( 2 );
	const opt = ( name ) => ( a.includes( name ) ? a[ a.indexOf( name ) + 1 ] : null );
	return { version: opt( '--wordpress' ) || PINNED, from: opt( '--from' ) };
}

function download( version ) {
	const cache = process.env.WP_API_COVERAGE_CACHE || path.join( os.tmpdir(), 'wp-api-coverage' );
	const url = `https://downloads.wordpress.org/release/wordpress-${ version }-no-content.zip`;
	const zip = path.join( cache, `wordpress-${ version }-no-content.zip` );
	const dir = path.join( cache, `wordpress-${ version }` );
	fs.mkdirSync( cache, { recursive: true } );
	if ( ! fs.existsSync( zip ) ) {
		console.log( `Downloading ${ url }` );
		execFileSync( 'curl', [ '-fsSL', '-o', zip, url ], { stdio: 'inherit' } );
	}
	// downloads.wordpress.org publishes a checksum beside each zip.
	const expected = execFileSync( 'curl', [ '-fsSL', `${ url }.sha1` ] ).toString().trim().split( /\s/ )[ 0 ];
	const actual = crypto.createHash( 'sha1' ).update( fs.readFileSync( zip ) ).digest( 'hex' );
	if ( expected !== actual ) {
		fs.rmSync( zip );
		throw new Error( `Checksum mismatch for ${ zip }: expected ${ expected }, got ${ actual }` );
	}
	if ( ! fs.existsSync( dir ) ) {
		execFileSync( 'unzip', [ '-q', zip, '-d', dir ] );
	}
	return { root: path.join( dir, 'wordpress' ), url };
}

function walk( dir, root, out = [] ) {
	for ( const entry of fs.readdirSync( dir, { withFileTypes: true } ) ) {
		const full = path.join( dir, entry.name );
		if ( entry.isDirectory() ) {
			walk( full, root, out );
		} else {
			out.push( path.relative( root, full ).split( path.sep ).join( '/' ) );
		}
	}
	return out;
}

/**
 * Finds the global functions, classes and hooks in one core file.
 *
 * @param {string} src  The file's source.
 * @param {string} file Its path relative to the WordPress root.
 * @return {{functions: Array, classes: Array, hooks: Array}} What it declares and fires.
 */
function scanCoreFile( src, file ) {
	const tokens = tokenize( src );
	const found = { functions: [], classes: [], hooks: [] };
	const stack = [];
	let pending = null;
	let doc = null;
	let namespaced = false;
	for ( let k = 0; k < tokens.length; k++ ) {
		const tok = tokens[ k ];
		const prev = tokens[ k - 1 ];
		const next = tokens[ k + 1 ];
		if ( tok.t === 'doc' ) {
			doc = tok.v;
			continue;
		}
		if ( tok.t === 'punct' ) {
			if ( tok.v === '{' ) {
				stack.push( pending || 'block' );
				pending = null;
				doc = null;
			} else if ( tok.v === '}' ) {
				stack.pop();
				doc = null;
			} else if ( tok.v === ';' ) {
				pending = null;
				doc = null;
			}
			continue;
		}
		if ( tok.t !== 'id' ) {
			continue;
		}
		const word = tok.v.toLowerCase();
		const afterArrow = prev && prev.t === 'punct' && [ '->', '?->', '::' ].includes( prev.v );
		if ( word === 'namespace' && next && next.t === 'id' && ! afterArrow ) {
			namespaced = true;
			continue;
		}
		const inCode = stack.includes( 'class' ) || stack.includes( 'function' );
		if ( word === 'function' ) {
			if ( prev && prev.t === 'id' && prev.v.toLowerCase() === 'use' ) {
				continue;
			}
			pending = 'function';
			const named = next && next.v === '&' ? tokens[ k + 2 ] : next;
			if ( named && named.t === 'id' && ! inCode && ! namespaced ) {
				found.functions.push( { name: named.v, file, ...docTags( doc ) } );
			}
			continue;
		}
		if ( word === 'class' && prev && prev.t === 'id' && prev.v.toLowerCase() === 'new' ) {
			// An anonymous class: its methods are still methods.
			pending = 'class';
			continue;
		}
		if ( [ 'class', 'interface', 'trait', 'enum' ].includes( word ) && ! afterArrow ) {
			if ( next && next.t === 'id' ) {
				pending = 'class';
				if ( ! inCode && ! namespaced ) {
					found.classes.push( { name: next.v, file, ...docTags( doc ) } );
				}
			} else if ( word === 'class' ) {
				pending = 'class';
			}
			continue;
		}
		if ( HOOK_FUNCTIONS[ word ] && next && next.v === '(' && ! afterArrow ) {
			const name = hookName( tokens, k + 2 );
			if ( name ) {
				const tags = docTags( doc );
				found.hooks.push( {
					name,
					type: HOOK_FUNCTIONS[ word ],
					file,
					since: tags.since,
					deprecated: word.endsWith( '_deprecated' ) || tags.deprecated,
					private: false,
				} );
			}
		}
	}
	return found;
}

const camel = ( s ) => s.replace( /-([a-z0-9])/g, ( m, c ) => c.toUpperCase() );

function packages( root ) {
	const src = fs.readFileSync( path.join( root, 'wp-includes/assets/script-loader-packages.php' ), 'utf8' );
	const names = [ ...src.matchAll( /^\t'([a-z0-9-]+)\.js' => array\(/gm ) ].map( ( m ) => m[ 1 ] );
	return names.map( ( name ) => ( {
		name: `@wordpress/${ name }`,
		handle: `wp-${ name }`,
		global: `wp.${ camel( name ) }`,
		area: packageArea( `@wordpress/${ name }` ),
	} ) );
}

function modules( root ) {
	const src = fs.readFileSync( path.join( root, 'wp-includes/assets/script-modules-packages.php' ), 'utf8' );
	const ids = new Set();
	for ( const m of src.matchAll( /^\t'([^']+\.js)' => array\(/gm ) ) {
		// The same rule wp_default_script_modules() uses to turn a file name into a module ID.
		ids.add( '@wordpress/' + m[ 1 ].replace( /(?:\/index)?(?:\.min)?\.js$/, '' ) );
	}
	return [ ...ids ].sort().map( ( id ) => {
		const pkg = id.split( '/' ).slice( 0, 2 ).join( '/' );
		return {
			name: id,
			area: packageArea( pkg ) === 'Editor packages' ? 'Script Modules' : packageArea( pkg ),
			// A core block's view script or a worker is loaded by core, not imported by plugins.
			private: /^@wordpress\/block-library\/|worker$|loader$|-init$/.test( id ),
		};
	} );
}

function supports( root ) {
	const paths = new Map();
	const dir = path.join( root, 'wp-includes/blocks' );
	for ( const block of fs.readdirSync( dir ) ) {
		const file = path.join( dir, block, 'block.json' );
		if ( ! fs.existsSync( file ) ) {
			continue;
		}
		const json = JSON.parse( fs.readFileSync( file, 'utf8' ) );
		for ( const key of supportPaths( json.supports ) ) {
			paths.set( key, ( paths.get( key ) || 0 ) + 1 );
		}
	}
	return [ ...paths ].sort().map( ( [ name, blocks ] ) => {
		const support = { name, area: 'Block supports', blocks };
		// Experimental supports can change or go away in any release, so they are never suggested.
		if ( /__(experimental|unstable)/.test( name ) ) {
			support.private = true;
		}
		return support;
	} );
}

function merge( list, key ) {
	// The same hook fires in several places and only one of them carries the docblock; keep that one.
	const byName = new Map();
	for ( const item of list ) {
		const k = key( item );
		const had = byName.get( k );
		if ( ! had || ( ! had.since && item.since ) ) {
			byName.set( k, item );
		}
	}
	return [ ...byName.values() ].sort( ( a, b ) => ( a.name < b.name ? -1 : a.name > b.name ? 1 : 0 ) );
}

function build( root, version, url ) {
	const files = walk( root, root ).filter( ( f ) => f.endsWith( '.php' ) && ! f.startsWith( 'wp-content/' ) && ! VENDOR.test( f ) );
	const all = { functions: [], classes: [], hooks: [] };
	for ( const file of files ) {
		const found = scanCoreFile( fs.readFileSync( path.join( root, file ), 'utf8' ), file );
		for ( const kind of Object.keys( all ) ) {
			all[ kind ].push( ...found[ kind ] );
		}
	}
	const shape = ( item ) => {
		if ( ! item.type && POLYFILLS.test( item.file ) ) {
			return null;
		}
		const out = { name: item.name, area: areaOf( item.file, item.name ), file: item.file, since: item.since || null };
		if ( item.type ) {
			out.type = item.type;
		}
		if ( item.deprecated || DEPRECATED_FILES.test( item.file ) ) {
			out.deprecated = true;
		}
		if ( item.private || underscored( item ) || ( ! item.type && SCREEN_FILES.test( item.file ) ) || BLOCK_INTERNALS.test( item.file ) ) {
			out.private = true;
		}
		return out;
	};
	return {
		wordpress: version,
		source: url,
		functions: merge( all.functions, ( f ) => f.name.toLowerCase() ).map( shape ).filter( Boolean ),
		classes: merge( all.classes, ( c ) => c.name.toLowerCase() ).map( shape ).filter( Boolean ),
		hooks: merge( all.hooks, ( h ) => h.name ).map( shape ).filter( Boolean ),
		packages: packages( root ),
		modules: modules( root ),
		supports: supports( root ),
	};
}

// One entry per line, so a version bump reads as a diff of what changed.
function serialize( catalog ) {
	const lines = [ '{' ];
	const keys = Object.keys( catalog );
	keys.forEach( ( key, i ) => {
		const value = catalog[ key ];
		const comma = i < keys.length - 1 ? ',' : '';
		if ( Array.isArray( value ) ) {
			lines.push( `\t${ JSON.stringify( key ) }: [` );
			value.forEach( ( item, j ) => lines.push( `\t\t${ JSON.stringify( item ) }${ j < value.length - 1 ? ',' : '' }` ) );
			lines.push( `\t]${ comma }` );
		} else {
			lines.push( `\t${ JSON.stringify( key ) }: ${ JSON.stringify( value ) }${ comma }` );
		}
	} );
	lines.push( '}' );
	return lines.join( '\n' ) + '\n';
}

if ( require.main === module ) {
	const { version, from } = args();
	const { root, url } = from ? { root: path.resolve( from ), url: `https://downloads.wordpress.org/release/wordpress-${ version }-no-content.zip` } : download( version );
	const catalog = build( root, version, url );
	const out = path.join( __dirname, '..', 'catalog', 'wordpress.json' );
	fs.writeFileSync( out, serialize( catalog ) );
	console.log( `Wrote ${ path.relative( process.cwd(), out ) }: WordPress ${ version }, ${ catalog.functions.length } functions, ${ catalog.classes.length } classes, ${ catalog.hooks.length } hooks, ${ catalog.packages.length } packages, ${ catalog.modules.length } script modules, ${ catalog.supports.length } block supports.` );
}

module.exports = { scanCoreFile, build, serialize };
