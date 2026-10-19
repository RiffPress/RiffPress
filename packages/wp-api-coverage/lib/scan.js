/**
 * Reads a plugin folder and lists every WordPress name it mentions in code: the functions it calls,
 * the classes it uses, the hooks it adds, the script handles and module IDs it depends on, the
 * `@wordpress/*` packages it imports, the `wp.*` globals it reads, and its block.json supports.
 *
 * The scan is static. It sees what is written in the files, not what runs.
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { tokenize, hookName, KEYWORDS } = require( './php.js' );

const IGNORE = [ 'node_modules', 'vendor', '.git', 'tests', 'test' ];

// Functions whose first argument is the name of a hook the plugin works with.
const HOOK_USERS = new Set( [
	'add_action', 'add_filter', 'remove_action', 'remove_filter', 'has_action', 'has_filter', 'did_action',
	'did_filter', 'doing_action', 'doing_filter', 'remove_all_actions', 'remove_all_filters', 'do_action',
	'do_action_ref_array', 'apply_filters', 'apply_filters_ref_array',
] );

function walk( dir, ignore, out = [] ) {
	for ( const entry of fs.readdirSync( dir, { withFileTypes: true } ) ) {
		if ( ignore.includes( entry.name ) ) {
			continue;
		}
		const full = path.join( dir, entry.name );
		if ( entry.isDirectory() ) {
			walk( full, ignore, out );
		} else if ( entry.isFile() ) {
			out.push( full );
		}
	}
	return out;
}

class Uses {
	constructor() {
		this.map = new Map();
	}
	add( name, file, line ) {
		const had = this.map.get( name );
		if ( had ) {
			had.count++;
		} else {
			this.map.set( name, { count: 1, at: `${ file }:${ line }` } );
		}
	}
	toJSON() {
		return Object.fromEntries( [ ...this.map ].sort( ( a, b ) => ( a[ 0 ] < b[ 0 ] ? -1 : 1 ) ) );
	}
}

/**
 * Collects the names one PHP file uses.
 *
 * @param {string} src   The file's source.
 * @param {string} file  Its path, for the report.
 * @param {Object} found The Uses collections to add to.
 */
function scanPhp( src, file, found ) {
	const tokens = tokenize( src );
	for ( let k = 0; k < tokens.length; k++ ) {
		const tok = tokens[ k ];
		const prev = tokens[ k - 1 ];
		const next = tokens[ k + 1 ];
		if ( tok.t === 'str' && ! tok.interp ) {
			// Script handles and module IDs are strings: dependency arrays, wp_enqueue_script(), block.json-style asset files.
			if ( /^wp-[a-z0-9-]+$/.test( tok.v ) ) {
				found.handles.add( tok.v, file, tok.line );
			} else if ( /^@wordpress\/[a-z0-9/-]+$/.test( tok.v ) ) {
				found.modules.add( tok.v, file, tok.line );
			}
			continue;
		}
		if ( tok.t !== 'id' ) {
			continue;
		}
		const member = prev && prev.t === 'punct' && [ '->', '?->', '::' ].includes( prev.v );
		const declared = prev && prev.t === 'id' && [ 'function', 'const', 'class', 'interface', 'trait', 'enum', 'namespace' ].includes( prev.v.toLowerCase() );
		if ( member || declared ) {
			continue;
		}
		// A namespaced name other than a fully qualified global one is not core's.
		const bare = tok.v.replace( /^\\/, '' );
		if ( bare.includes( '\\' ) ) {
			continue;
		}
		const lower = bare.toLowerCase();
		if ( KEYWORDS.has( lower ) ) {
			continue;
		}
		const isNew = prev && prev.t === 'id' && prev.v.toLowerCase() === 'new';
		if ( next && next.t === 'punct' && next.v === '(' && ! isNew ) {
			found.functions.add( lower, file, tok.line );
			if ( HOOK_USERS.has( lower ) ) {
				const name = hookName( tokens, k + 2 );
				if ( name ) {
					found.hooks.add( name, file, tok.line );
				}
				// A core function passed by name as the callback: add_filter( 'x', '__return_false' ).
				const callback = argument( tokens, k + 2, 1 );
				if ( callback && callback.t === 'str' && /^[A-Za-z_]\w*$/.test( callback.v ) ) {
					found.functions.add( callback.v.toLowerCase(), file, callback.line );
				}
			}
			continue;
		}
		// Anything else that names a class: new, extends, implements, type declarations, static calls, instanceof.
		found.classes.add( lower, file, tok.line );
	}
}

// The first token of argument `index` (0-based) of a call whose arguments start at token k.
function argument( tokens, k, index ) {
	let depth = 0;
	let seen = 0;
	if ( index === 0 ) {
		return tokens[ k ];
	}
	for ( let j = k; j < tokens.length; j++ ) {
		const v = tokens[ j ].t === 'punct' ? tokens[ j ].v : null;
		if ( v === '(' || v === '[' || v === '{' ) {
			depth++;
		} else if ( v === ')' || v === ']' || v === '}' ) {
			if ( depth === 0 ) {
				return null;
			}
			depth--;
		} else if ( v === ',' && depth === 0 ) {
			seen++;
			if ( seen === index ) {
				return tokens[ j + 1 ];
			}
		}
	}
	return null;
}

/**
 * JavaScript source with its comments blanked out, so commented-out imports are not counted.
 * Strings and template literals are kept, unless `blankStrings` is set.
 *
 * @param {string}  src            JavaScript source.
 * @param {boolean} [blankStrings] Empty every string too, for scans that look for code, not module names.
 * @return {string} The source without comments; line breaks stay where they were.
 */
function stripJsComments( src, blankStrings = false ) {
	let out = '';
	let i = 0;
	while ( i < src.length ) {
		const c = src[ i ];
		if ( c === '/' && src[ i + 1 ] === '/' ) {
			while ( i < src.length && src[ i ] !== '\n' ) {
				i++;
			}
			continue;
		}
		if ( c === '/' && src[ i + 1 ] === '*' ) {
			const end = src.indexOf( '*/', i + 2 );
			const stop = end === -1 ? src.length : end + 2;
			out += src.slice( i, stop ).replace( /[^\n]/g, '' );
			i = stop;
			continue;
		}
		if ( c === '\'' || c === '"' || c === '`' ) {
			let j = i + 1;
			while ( j < src.length && src[ j ] !== c && ( c === '`' || src[ j ] !== '\n' ) ) {
				j += src[ j ] === '\\' ? 2 : 1;
			}
			const literal = src.slice( i, j + 1 );
			out += blankStrings ? c + literal.slice( 1, -1 ).replace( /[^\n]/g, '' ) + c : literal;
			i = j + 1;
			continue;
		}
		out += c;
		i++;
	}
	return out;
}

/**
 * Collects the names one JavaScript file uses.
 *
 * @param {string} src   The file's source.
 * @param {string} file  Its path, for the report.
 * @param {Object} found The Uses collections to add to.
 */
function scanJs( src, file, found ) {
	const code = stripJsComments( src );
	const lineAt = ( index ) => code.slice( 0, index ).split( '\n' ).length;
	const imports = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)(['"])(@wordpress\/[a-z0-9-]+(?:\/[a-z0-9/-]+)?)\1/g;
	for ( const m of code.matchAll( imports ) ) {
		found.imports.add( m[ 2 ], file, lineAt( m.index ) );
	}
	const bare = stripJsComments( src, true );
	for ( const m of bare.matchAll( /(?<![\w$.])(?:window\.)?wp\.([A-Za-z_$][\w$]*)/g ) ) {
		found.globals.add( `wp.${ m[ 1 ] }`, file, lineAt( m.index ) );
	}
	// const { blocks, element } = wp;
	for ( const m of bare.matchAll( /\{([^{}]*)\}\s*=\s*(?:window\.)?wp\b(?!\s*\.)/g ) ) {
		for ( const part of m[ 1 ].split( ',' ) ) {
			const name = part.split( ':' )[ 0 ].trim();
			if ( /^[A-Za-z_$][\w$]*$/.test( name ) ) {
				found.globals.add( `wp.${ name }`, file, lineAt( m.index ) );
			}
		}
	}
}

/**
 * The supports a block.json declares, as dotted paths two levels deep: `color`, `color.background`.
 *
 * @param {Object} supports The block.json `supports` object.
 * @return {string[]} The paths.
 */
function supportPaths( supports ) {
	const out = [];
	for ( const [ key, v ] of Object.entries( supports || {} ) ) {
		out.push( key );
		if ( v && typeof v === 'object' && ! Array.isArray( v ) ) {
			for ( const sub of Object.keys( v ) ) {
				// Which controls show by default, and where styles apply, are settings of a support.
				if ( sub !== '__experimentalDefaultControls' && sub !== '__experimentalSelector' ) {
					out.push( `${ key }.${ sub }` );
				}
			}
		}
	}
	return out;
}

/**
 * Scans a plugin folder.
 *
 * @param {string}   dir              The plugin folder.
 * @param {Object}   [options]
 * @param {string[]} [options.ignore] Folder names to skip; defaults to node_modules, vendor, .git, tests and test.
 * @return {Object} Counts of the files read, and a Uses collection per kind of name.
 */
function scanPlugin( dir, options = {} ) {
	const root = path.resolve( dir );
	const found = {
		functions: new Uses(),
		classes: new Uses(),
		hooks: new Uses(),
		handles: new Uses(),
		modules: new Uses(),
		imports: new Uses(),
		globals: new Uses(),
		supports: new Uses(),
	};
	const files = { php: 0, js: 0, blockJson: 0 };
	for ( const full of walk( root, options.ignore || IGNORE ) ) {
		const rel = path.relative( root, full ).split( path.sep ).join( '/' );
		if ( full.endsWith( '.php' ) ) {
			files.php++;
			scanPhp( fs.readFileSync( full, 'utf8' ), rel, found );
		} else if ( /\.(?:js|mjs|cjs|jsx|ts|tsx)$/.test( full ) ) {
			files.js++;
			scanJs( fs.readFileSync( full, 'utf8' ), rel, found );
		} else if ( path.basename( full ) === 'block.json' ) {
			files.blockJson++;
			let json;
			try {
				json = JSON.parse( fs.readFileSync( full, 'utf8' ) );
			} catch {
				continue;
			}
			for ( const key of supportPaths( json.supports ) ) {
				found.supports.add( key, rel, 1 );
			}
			for ( const field of [ 'viewScriptModule', 'viewScript', 'editorScript', 'script' ] ) {
				for ( const value of [].concat( json[ field ] || [] ) ) {
					if ( /^@wordpress\//.test( value ) ) {
						found.modules.add( value, rel, 1 );
					} else if ( /^wp-/.test( value ) ) {
						found.handles.add( value, rel, 1 );
					}
				}
			}
		}
	}
	return { root, files, found };
}

module.exports = { scanPlugin, scanPhp, scanJs, stripJsComments, supportPaths, Uses };
