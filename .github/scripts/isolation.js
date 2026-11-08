/**
 * Holds every plugin in this repository to the isolation.json beside its main file
 * (docs/isolation.md): the option and meta keys it touches are under prefixes it owns, the REST
 * namespaces, capabilities, outbound hosts, Riff hooks, player events, window.riff members and
 * script handles it uses are the ones it declares, and it uses none of the primitives the
 * document rules out. PHPCS (phpcs.xml.dist) catches the primitives it has sniffs for; this
 * catches the rest, and everything that needs the manifest.
 *
 * It reads source text, not a syntax tree, so it sees what is written literally: a key built from
 * a variable is beyond it, and the runtime guards in docs/isolation.md are what cover those. It
 * guards against mistakes, not against a plugin that sets out to hide what it does.
 *
 *   node .github/scripts/isolation.js --check   fails, saying how to fix each problem
 *   node .github/scripts/isolation.js --found   prints what each plugin's code uses, as JSON
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const ROOT = path.resolve( __dirname, '..', '..' );
const PLUGINS = path.join( ROOT, 'plugins' );
const DOC = 'docs/isolation.md';

// ---- Reading source.

/**
 * PHP with its comments blanked out and its strings kept, so a docblock that mentions a function
 * isn't taken for a call, and line numbers stay where they were.
 *
 * @param {string} code
 * @return {string}
 */
function stripPhp( code ) {
	let out = '';
	let i = 0;
	const blank = ( s ) => s.replace( /[^\n]/g, ' ' );
	while ( i < code.length ) {
		const c = code[ i ];
		const two = code.slice( i, i + 2 );
		if ( two === '/*' ) {
			const end = code.indexOf( '*/', i + 2 );
			const stop = end < 0 ? code.length : end + 2;
			out += blank( code.slice( i, stop ) );
			i = stop;
		} else if ( two === '//' || ( c === '#' && code[ i + 1 ] !== '[' ) ) {
			let stop = code.indexOf( '\n', i );
			stop = stop < 0 ? code.length : stop;
			// A comment ends at ?> too, but nothing here closes PHP mid-line.
			out += blank( code.slice( i, stop ) );
			i = stop;
		} else if ( c === "'" || c === '"' ) {
			let j = i + 1;
			while ( j < code.length && code[ j ] !== c ) {
				j += code[ j ] === '\\' ? 2 : 1;
			}
			out += code.slice( i, j + 1 );
			i = j + 1;
		} else {
			out += c;
			i++;
		}
	}
	return out;
}

/**
 * JavaScript with its comments blanked out, the same way. Template literals and regular
 * expressions are kept as they are; a comment marker inside one is rare enough here.
 *
 * @param {string} code
 * @return {string}
 */
function stripJs( code ) {
	let out = '';
	let i = 0;
	const blank = ( s ) => s.replace( /[^\n]/g, ' ' );
	while ( i < code.length ) {
		const c = code[ i ];
		const two = code.slice( i, i + 2 );
		if ( two === '/*' ) {
			const end = code.indexOf( '*/', i + 2 );
			const stop = end < 0 ? code.length : end + 2;
			out += blank( code.slice( i, stop ) );
			i = stop;
		} else if ( two === '//' && code[ i - 1 ] !== ':' && code[ i - 1 ] !== '\\' ) {
			let stop = code.indexOf( '\n', i );
			stop = stop < 0 ? code.length : stop;
			out += blank( code.slice( i, stop ) );
			i = stop;
		} else if ( c === "'" || c === '"' || c === '`' ) {
			let j = i + 1;
			while ( j < code.length && code[ j ] !== c ) {
				j += code[ j ] === '\\' ? 2 : 1;
			}
			out += code.slice( i, j + 1 );
			i = j + 1;
		} else {
			out += c;
			i++;
		}
	}
	return out;
}

const lineOf = ( code, index ) => code.slice( 0, index ).split( '\n' ).length;

/**
 * The text of a call's arguments, from the opening parenthesis at `open`, balanced, with strings
 * skipped.
 *
 * @param {string} code
 * @param {number} open Index of the `(`.
 * @return {string}
 */
function argsAt( code, open ) {
	let depth = 0;
	for ( let i = open; i < code.length; i++ ) {
		const c = code[ i ];
		if ( c === "'" || c === '"' ) {
			let j = i + 1;
			while ( j < code.length && code[ j ] !== c ) {
				j += code[ j ] === '\\' ? 2 : 1;
			}
			i = j;
		} else if ( c === '(' || c === '[' || c === '{' ) {
			depth++;
		} else if ( c === ')' || c === ']' || c === '}' ) {
			depth--;
			if ( depth === 0 ) {
				return code.slice( open + 1, i );
			}
		}
	}
	return code.slice( open + 1 );
}

/**
 * Top-level arguments of an argument list.
 *
 * @param {string} args
 * @return {string[]}
 */
function splitArgs( args ) {
	const out = [];
	let depth = 0;
	let from = 0;
	for ( let i = 0; i < args.length; i++ ) {
		const c = args[ i ];
		if ( c === "'" || c === '"' ) {
			let j = i + 1;
			while ( j < args.length && args[ j ] !== c ) {
				j += args[ j ] === '\\' ? 2 : 1;
			}
			i = j;
		} else if ( '([{'.includes( c ) ) {
			depth++;
		} else if ( ')]}'.includes( c ) ) {
			depth--;
		} else if ( c === ',' && depth === 0 ) {
			out.push( args.slice( from, i ).trim() );
			from = i + 1;
		}
	}
	const last = args.slice( from ).trim();
	if ( last ) {
		out.push( last );
	}
	return out;
}

/**
 * Every call of the named functions: its name, its arguments and its line.
 *
 * @param {string}   code  Stripped source.
 * @param {string[]} names Function names.
 * @return {{name: string, args: string[], line: number, index: number}[]}
 */
function calls( code, names ) {
	const re = new RegExp( `(?<![\\w$>:\\\\])(${ names.join( '|' ) })\\s*\\(`, 'g' );
	return [ ...code.matchAll( re ) ]
		.filter( ( m ) => ! /function\s+&?\s*$/.test( code.slice( Math.max( 0, m.index - 12 ), m.index ) ) )
		.map( ( m ) => ( {
		name: m[ 1 ],
		args: splitArgs( argsAt( code, m.index + m[ 0 ].length - 1 ) ),
		line: lineOf( code, m.index ),
		index: m.index,
	} ) );
}

// ---- Constants, so `self::KEY` and `Passkeys::META` read as the keys they are.

/**
 * Every class constant and define() in a plugin's PHP, by `Class::NAME` and by `NAME`.
 *
 * @param {{file: string, code: string}[]} files
 * @return {Map<string, string>}
 */
function constants( files ) {
	const map = new Map();
	for ( const { code } of files ) {
		const marks = [ ...code.matchAll( /\b(?:class|interface|trait|enum)\s+([A-Za-z_]\w*)/g ) ];
		for ( const m of code.matchAll( /\bconst\s+([A-Z_][A-Z0-9_]*)\s*=\s*'([^']*)'/g ) ) {
			const owner = marks.filter( ( c ) => c.index < m.index ).pop();
			if ( owner ) {
				map.set( `${ owner[ 1 ] }::${ m[ 1 ] }`, m[ 2 ] );
			}
		}
		for ( const m of code.matchAll( /\bdefine\(\s*'([A-Z_][A-Z0-9_]*)'\s*,\s*'([^']*)'/g ) ) {
			map.set( m[ 1 ], m[ 2 ] );
		}
	}
	return map;
}

/**
 * What an argument is, as far as the text says: `{ value, exact }` for a literal or a constant,
 * with `exact` false when more is concatenated after it, or null when it is beyond reading.
 *
 * @param {string}              arg
 * @param {Map<string, string>} consts
 * @param {string}              inClass The class the call is in, for self::.
 * @return {{value: string, exact: boolean}|null}
 */
function resolve( arg, consts, inClass ) {
	if ( ! arg ) {
		return null;
	}
	const parts = splitConcat( arg );
	const first = parts[ 0 ].trim();
	let value = null;
	let m;
	if ( ( m = first.match( /^'([^'\\]*)'$/ ) ) || ( m = first.match( /^"([^"\\$]*)"$/ ) ) ) {
		value = m[ 1 ];
	} else if ( ( m = first.match( /^(?:\\?[\w\\]*\\)?(self|static|[A-Z]\w*)::([A-Z_][A-Z0-9_]*)$/ ) ) ) {
		const owner = m[ 1 ] === 'self' || m[ 1 ] === 'static' ? inClass : m[ 1 ];
		value = consts.get( `${ owner }::${ m[ 2 ] }` ) ?? null;
	} else if ( ( m = first.match( /^([A-Z_][A-Z0-9_]*)$/ ) ) ) {
		value = consts.get( m[ 1 ] ) ?? null;
	}
	if ( value === null ) {
		return null;
	}
	return { value, exact: parts.length === 1 };
}

// `'a' . $b . 'c'` as its pieces, at the top level.
function splitConcat( arg ) {
	const out = [];
	let depth = 0;
	let from = 0;
	for ( let i = 0; i < arg.length; i++ ) {
		const c = arg[ i ];
		if ( c === "'" || c === '"' ) {
			let j = i + 1;
			while ( j < arg.length && arg[ j ] !== c ) {
				j += arg[ j ] === '\\' ? 2 : 1;
			}
			i = j;
		} else if ( '([{'.includes( c ) ) {
			depth++;
		} else if ( ')]}'.includes( c ) ) {
			depth--;
		} else if ( c === '.' && depth === 0 && ! /\d/.test( arg[ i + 1 ] || '' ) ) {
			out.push( arg.slice( from, i ) );
			from = i + 1;
		}
	}
	out.push( arg.slice( from ) );
	return out;
}

const classAt = ( code, index ) =>
	[ ...code.slice( 0, index ).matchAll( /\b(?:class|interface|trait|enum)\s+([A-Za-z_]\w*)/g ) ].pop()?.[ 1 ] || '';

// ---- Annotations: a line that does something the rules question says why, in a comment that
// names the rule: `// isolation: write -- the drawn cover, under uploads/riff-art`. The reason
// is for the reviewer; the check only asks that one is there.
function annotated( raw, line, rule ) {
	const lines = raw.split( '\n' );
	const re = new RegExp( `isolation:\\s*${ rule }\\s+--\\s*\\S` );
	return re.test( lines[ line - 1 ] || '' ) || re.test( lines[ line - 2 ] || '' );
}

// ---- What the code uses.

const OPTION_CALLS = {
	read: [ 'get_option', 'get_site_option', 'get_transient', 'get_site_transient' ],
	write: [
		'update_option',
		'add_option',
		'delete_option',
		'update_site_option',
		'add_site_option',
		'delete_site_option',
		'set_transient',
		'delete_transient',
		'set_site_transient',
		'delete_site_transient',
	],
};
// The argument that is the key, counting from 0.
const META_CALLS = {
	read: { get_post_meta: 1, get_user_meta: 1, get_term_meta: 1, get_comment_meta: 1, get_user_option: 0, get_metadata: 2 },
	write: {
		update_post_meta: 1,
		add_post_meta: 1,
		delete_post_meta: 1,
		update_user_meta: 1,
		add_user_meta: 1,
		delete_user_meta: 1,
		update_term_meta: 1,
		add_term_meta: 1,
		delete_term_meta: 1,
		update_user_option: 1,
		delete_user_option: 1,
		update_metadata: 2,
		add_metadata: 2,
		delete_metadata: 2,
		delete_post_meta_by_key: 0,
		register_post_meta: 1,
		register_term_meta: 1,
		register_meta: 1,
	},
};
const HTTP_CALLS = [
	'wp_remote_get',
	'wp_remote_post',
	'wp_remote_head',
	'wp_remote_request',
	'wp_safe_remote_get',
	'wp_safe_remote_post',
	'wp_safe_remote_head',
	'wp_safe_remote_request',
	'download_url',
];
const SPAWN_CALLS = [ 'exec', 'shell_exec', 'system', 'passthru', 'proc_open', 'popen', 'pcntl_exec' ];
// Writes to the filesystem. fopen() only counts when its mode writes.
const WRITE_CALLS = [
	'file_put_contents',
	'rename',
	'copy',
	'mkdir',
	'wp_mkdir_p',
	'touch',
	'symlink',
	'chmod',
	'move_uploaded_file',
	'unzip_file',
	'fopen',
];

/**
 * A plugin's files: PHP and JavaScript, without its tests or anything installed.
 *
 * @param {string} dir
 * @return {string[]}
 */
function sourceFiles( dir ) {
	return fs.readdirSync( dir, { withFileTypes: true } ).flatMap( ( d ) => {
		const full = path.join( dir, d.name );
		if ( d.isDirectory() ) {
			return [ 'tests', 'node_modules', 'vendor', 'build', 'languages', 'extensions' ].includes( d.name )
				? []
				: sourceFiles( full );
		}
		return /\.(php|js|mjs)$/.test( d.name ) && ! d.name.endsWith( '.asset.php' ) ? [ full ] : [];
	} );
}

/**
 * Everything a plugin's code uses that its manifest speaks to, each with where it is.
 *
 * @param {string} dir The plugin's folder.
 * @return {Object}
 */
function scan( dir ) {
	const rel = ( file ) => path.relative( ROOT, file );
	const all = sourceFiles( dir ).map( ( file ) => {
		const raw = fs.readFileSync( file, 'utf8' );
		const php = file.endsWith( '.php' );
		return { file, rel: rel( file ), raw, php, code: php ? stripPhp( raw ) : stripJs( raw ) };
	} );
	const php = all.filter( ( f ) => f.php );
	const js = all.filter( ( f ) => ! f.php );
	const consts = constants( php );
	const found = {
		options: [],
		meta: [],
		namespaces: [],
		fields: [],
		routes: [],
		capabilities: [],
		hosts: [],
		hooks: [],
		functions: [],
		events: [],
		api: [],
		scripts: [],
		modules: [],
		classes: [],
		imports: [],
		spawn: [],
		writes: [],
		includes: [],
		iframes: [],
	};
	const at = ( f, line ) => `${ f.rel }:${ line }`;

	for ( const f of php ) {
		const { code } = f;
		const key = ( c, n ) => resolve( c.args[ n ], consts, classAt( code, c.index ) );
		for ( const [ kind, names ] of Object.entries( OPTION_CALLS ) ) {
			for ( const c of calls( code, names ) ) {
				const k = key( c, 0 );
				if ( k ) {
					found.options.push( { ...k, write: kind === 'write', call: c.name, where: at( f, c.line ) } );
				}
			}
		}
		for ( const c of calls( code, [ 'register_setting' ] ) ) {
			const k = key( c, 1 );
			if ( k ) {
				found.options.push( { ...k, write: true, call: c.name, where: at( f, c.line ) } );
			}
		}
		for ( const [ kind, names ] of Object.entries( META_CALLS ) ) {
			for ( const c of calls( code, Object.keys( names ) ) ) {
				const k = key( c, names[ c.name ] );
				if ( k ) {
					found.meta.push( { ...k, write: kind === 'write', call: c.name, where: at( f, c.line ) } );
				}
			}
		}
		for ( const c of calls( code, [ 'register_rest_route' ] ) ) {
			const ns = key( c, 0 );
			const route = key( c, 1 );
			const body = c.args.slice( 2 ).join( ',' );
			found.namespaces.push( { value: ns ? ns.value : null, where: at( f, c.line ) } );
			// Each endpoint's permission_callback, with the methods written before it (GET if none).
			const endpoints = [];
			let methods = 'GET';
			for ( const m of body.matchAll( /'(methods|permission_callback)'\s*=>\s*([^,\n]+)/g ) ) {
				if ( m[ 1 ] === 'methods' ) {
					methods = m[ 2 ].replace( /[\s)\]]+$/, '' ).trim();
				} else {
					endpoints.push( { methods, callback: m[ 2 ].replace( /[\s)\]]+$/, '' ).trim() } );
					methods = 'GET';
				}
			}
			found.routes.push( {
				route: `${ ns ? ns.value : '?' }${ route ? route.value : '?' }`,
				endpoints,
				where: at( f, c.line ),
				// A variable the file sets to __return_true is __return_true.
				open: [ ...code.matchAll( /(\$\w+)\s*=\s*'__return_true'/g ) ].map( ( m ) => m[ 1 ] ),
			} );
		}
		for ( const c of calls( code, [ 'register_rest_field' ] ) ) {
			const object = key( c, 0 );
			const field = key( c, 1 );
			// A field named from a variable (a loop over several) is beyond reading.
			if ( object && field ) {
				found.fields.push( { value: `${ object.value }.${ field.value }`, where: at( f, c.line ) } );
			}
		}
		for ( const c of calls( code, [ 'current_user_can', 'user_can', 'current_user_can_for_site' ] ) ) {
			const k = key( c, c.name === 'current_user_can' ? 0 : 1 );
			if ( k ) {
				found.capabilities.push( { value: k.value, where: at( f, c.line ) } );
			}
		}
		for ( const c of calls( code, HTTP_CALLS ) ) {
			const k = key( c, 0 );
			const host = k && k.value.match( /^https?:\/\/([^/:?#]+)/i );
			found.hosts.push( { value: host ? host[ 1 ].toLowerCase() : null, where: at( f, c.line ) } );
		}
		for ( const c of calls( code, [ 'add_action', 'add_filter', 'remove_action', 'remove_filter', 'has_filter', 'has_action' ] ) ) {
			const k = key( c, 0 );
			if ( k && /^riff_/.test( k.value ) ) {
				found.hooks.push( { value: k.value, where: at( f, c.line ) } );
			}
		}
		for ( const m of code.matchAll( /(?<![\w$>:\\])(riff_[a-z_]+)\s*\(/g ) ) {
			if ( ! /function\s+$/.test( code.slice( Math.max( 0, m.index - 20 ), m.index ) ) ) {
				found.functions.push( { value: m[ 1 ], where: at( f, lineOf( code, m.index ) ) } );
			}
		}
		for ( const m of code.matchAll( /\bRiff\\([A-Za-z_][\w\\]*)/g ) ) {
			found.classes.push( { value: m[ 1 ], where: at( f, lineOf( code, m.index ) ) } );
		}
		for ( const [ names, into ] of [
			[ [ 'wp_enqueue_script', 'wp_register_script' ], 'scripts' ],
			[ [ 'wp_enqueue_script_module', 'wp_register_script_module' ], 'modules' ],
		] ) {
			for ( const c of calls( code, names ) ) {
				const k = key( c, 0 );
				// wp_enqueue_script( 'handle' ) alone loads one registered elsewhere, maybe core's.
				if ( k && ( c.name.includes( 'register' ) || c.args.length > 1 ) ) {
					found[ into ].push( { value: k.value, where: at( f, c.line ) } );
				}
			}
		}
		for ( const c of calls( code, SPAWN_CALLS ) ) {
			found.spawn.push( { value: c.name, where: at( f, c.line ), ok: annotated( f.raw, c.line, 'spawn' ) } );
		}
		for ( const c of calls( code, WRITE_CALLS ) ) {
			if ( c.name === 'fopen' && ! /['"][^'"]*[waxc+][^'"]*['"]/.test( c.args[ 1 ] || '' ) ) {
				continue;
			}
			found.writes.push( { value: c.name, where: at( f, c.line ), ok: annotated( f.raw, c.line, 'write' ) } );
		}
		for ( const m of code.matchAll( /(?:^|[;{}])[ \t]*(include|require)(?:_once)?\b\s*\(?([^;]*);/gm ) ) {
			// A path with no variable in it (a literal, or __DIR__ or a constant and a literal) is
			// fixed; one with a variable could be anything.
			if ( ! m[ 2 ].includes( '$' ) ) {
				continue;
			}
			const line = lineOf( code, m.index + m[ 0 ].indexOf( m[ 1 ] ) );
			found.includes.push( { value: m[ 2 ].trim().replace( /\)$/, '' ).trim(), where: at( f, line ), ok: annotated( f.raw, line, 'include' ) } );
		}
	}

	for ( const f of js ) {
		const { code } = f;
		for ( const m of code.matchAll( /'riff:([a-z_]+)'|(?:addAction|addFilter|removeAction|removeFilter)\(\s*'riff\.([a-z_]+)'|\.on\(\s*'([a-z_]+)'/g ) ) {
			found.events.push( { value: m[ 1 ] || m[ 2 ] || m[ 3 ], where: at( f, lineOf( code, m.index ) ) } );
		}
		for ( const m of code.matchAll( /(?:window\.riff|player\(\))\??\.([a-zA-Z]+)/g ) ) {
			found.api.push( { value: m[ 1 ], where: at( f, lineOf( code, m.index ) ) } );
		}
		for ( const m of code.matchAll( /\bfetch\(\s*['"`](https?:)?\/\/([^/'"`:?#$]+)/g ) ) {
			found.hosts.push( { value: m[ 2 ].toLowerCase(), where: at( f, lineOf( code, m.index ) ) } );
		}
		for ( const m of code.matchAll( /new\s+(?:WebSocket|EventSource)\(\s*['"`]wss?:\/\/([^/'"`:?#$]+)/g ) ) {
			found.hosts.push( { value: m[ 1 ].toLowerCase(), where: at( f, lineOf( code, m.index ) ) } );
		}
		for ( const m of code.matchAll( /(?:\bimport\b[^'"`;]*?|import\(\s*)['"]([^'"]+)['"]/g ) ) {
			found.imports.push( { value: m[ 1 ], where: at( f, lineOf( code, m.index ) ) } );
		}
	}

	// An iframe anywhere, in PHP's markup or a script's.
	for ( const f of all ) {
		for ( const m of f.code.matchAll( /<iframe\b[^>]*>|createElement\(\s*['"]iframe['"]\s*\)/gi ) ) {
			const line = lineOf( f.code, m.index );
			const near = f.code.split( '\n' ).slice( line - 1, line + 5 ).join( '\n' );
			found.iframes.push( { where: at( f, line ), ok: /\bsandbox\b/.test( m[ 0 ].startsWith( '<' ) ? m[ 0 ] : near ) } );
		}
	}
	return found;
}

// ---- The rules.

const own = ( key, prefixes ) => prefixes.some( ( p ) => key.startsWith( p ) );

/**
 * Whose a key is among the manifests: the plugin with the longest prefix it starts with.
 *
 * @param {string}                  key
 * @param {string}                  kind      `options` or `meta`.
 * @param {Object<string, Object>}  manifests By slug.
 * @return {string|null}
 */
function owner( key, kind, manifests ) {
	let best = null;
	let length = -1;
	for ( const [ slug, m ] of Object.entries( manifests ) ) {
		for ( const p of m.data?.[ kind ] || [] ) {
			if ( key.startsWith( p ) && p.length > length ) {
				best = slug;
				length = p.length;
			}
		}
	}
	return best;
}

/**
 * Whether a host is one a manifest names: exactly, or under a `*.` wildcard.
 *
 * @param {string}   host
 * @param {string[]} hosts
 * @return {boolean}
 */
function hostAllowed( host, hosts ) {
	return hosts.some( ( h ) =>
		h.startsWith( '*.' ) ? host === h.slice( 2 ) || host.endsWith( h.slice( 1 ) ) : host === h
	);
}

/**
 * Every problem with one plugin, each a sentence that says how to fix it.
 *
 * @param {string}                 slug
 * @param {Object}                 found     What scan() found.
 * @param {Object<string, Object>} manifests Every plugin's manifest, by slug.
 * @param {Object}                 riff      What Riff makes public: { hooks, events, api, functions }.
 * @return {string[]}
 */
function check( slug, found, manifests, riff ) {
	const m = manifests[ slug ];
	const errors = [];
	const say = ( where, text ) => errors.push( `${ where }: ${ text }` );
	const extension = slug !== 'riff';
	const manifestFile = `plugins/${ slug }/isolation.json`;

	for ( const kind of [ 'options', 'meta' ] ) {
		const prefixes = m.data?.[ kind ] || [];
		const label = kind === 'options' ? 'option or transient' : 'meta key';
		// WordPress's own keys a plugin writes on purpose, each with why: a featured image.
		const shared = m.data?.shared || {};
		for ( const k of found[ kind ] ) {
			const whose = owner( k.value, kind, manifests );
			if ( whose && whose !== slug ) {
				// A prefix of a key built at runtime may still land in our own space; only a key
				// fully under another's prefix is theirs for certain.
				if ( k.exact || k.value.length >= ( manifests[ whose ].data[ kind ].find( ( p ) => k.value.startsWith( p ) ) || '' ).length ) {
					say(
						k.where,
						`${ k.call }() uses the ${ label } '${ k.value }', which is ${ whose }'s (its isolation.json). Reach another plugin's data through its public API, not its keys.`
					);
				}
				continue;
			}
			if ( k.write && ! own( k.value, prefixes ) && ! ( k.exact && shared[ k.value ] ) ) {
				say(
					k.where,
					`${ k.call }() writes the ${ label } '${ k.value }${ k.exact ? '' : '…' }', outside the prefixes ${ manifestFile } declares (data.${ kind }: ${ JSON.stringify( prefixes ) }). Name it under one of them, or declare its prefix there; a key of WordPress's own goes in data.shared with the reason.`
				);
			}
		}
	}

	const namespaces = m.rest?.namespaces || [];
	for ( const n of found.namespaces ) {
		if ( n.value === null ) {
			say( n.where, `register_rest_route()'s namespace can't be read here. Use a literal or a class constant, so the check can hold it to rest.namespaces in ${ manifestFile }.` );
		} else if ( ! namespaces.includes( n.value ) ) {
			say( n.where, `the REST namespace '${ n.value }' is not in rest.namespaces in ${ manifestFile }. Declare it, or register the route under one that is.` );
		}
	}
	const publicRoutes = m.rest?.public || {};
	for ( const r of found.routes ) {
		if ( ! r.endpoints.length ) {
			say( r.where, `${ r.route } has no permission_callback. Give every endpoint one that checks what the caller may do; WordPress treats a missing one as a mistake for good reason.` );
			continue;
		}
		for ( const e of r.endpoints ) {
			const open = e.callback === "'__return_true'" || r.open.includes( e.callback );
			const reads = /^(?:'GET'|WP_REST_Server::READABLE|\\WP_REST_Server::READABLE)$/.test( e.methods );
			if ( open && ! reads && ! publicRoutes[ r.route ] ) {
				say(
					r.where,
					`${ r.route } lets anyone ${ e.methods } (permission_callback __return_true). Check a capability or the signed-in user; or, for a route that is meant for strangers (signing in), name it in rest.public in ${ manifestFile } with the reason and what limits it.`
				);
			}
		}
	}
	for ( const route of Object.keys( publicRoutes ) ) {
		if ( ! found.routes.some( ( r ) => r.route === route ) ) {
			say( manifestFile, `rest.public names ${ route }, which the code doesn't register. Take it out.` );
		}
	}
	for ( const field of found.fields ) {
		if ( ! ( m.rest?.fields || [] ).includes( field.value ) ) {
			say( field.where, `the REST field ${ field.value } is not in rest.fields in ${ manifestFile }. Declare it.` );
		}
	}

	const caps = m.capabilities || [];
	for ( const c of found.capabilities ) {
		if ( ! caps.includes( c.value ) ) {
			say( c.where, `it checks the capability '${ c.value }', which is not in capabilities in ${ manifestFile }. Declare it.` );
		}
	}
	for ( const cap of caps ) {
		if ( ! found.capabilities.some( ( c ) => c.value === cap ) ) {
			say( manifestFile, `capabilities names '${ cap }', which the code never checks. Take it out.` );
		}
	}

	const hosts = m.hosts || [];
	for ( const h of found.hosts ) {
		if ( h.value && ! hostAllowed( h.value, hosts ) ) {
			say( h.where, `it calls ${ h.value }, which is not in hosts in ${ manifestFile }. Declare the host, or don't call out.` );
		}
	}

	const spawns = m.spawn || [];
	for ( const s of found.spawn ) {
		if ( ! spawns.length ) {
			say( s.where, `${ s.value }() runs a program, and ${ manifestFile } declares none (spawn). Do it without a shell, or declare the program and say why on the line: // isolation: spawn -- <why>.` );
		} else if ( ! s.ok ) {
			say( s.where, `${ s.value }() runs a program. Say on the line or the one before which it is and why it is safe: // isolation: spawn -- <why>.` );
		}
	}
	for ( const w of found.writes ) {
		if ( ! w.ok ) {
			say( w.where, `${ w.value }() writes to the filesystem. A plugin writes only under uploads or the temp folder; say which on the line or the one before: // isolation: write -- <where, and why>.` );
		}
	}
	for ( const i of found.includes ) {
		if ( ! i.ok ) {
			say( i.where, `include of a path from a variable (${ i.value }). Include a fixed path (__DIR__ . '/…'), or say on the line why this one can only be a file the plugin ships: // isolation: include -- <why>.` );
		}
	}
	for ( const f of found.iframes ) {
		if ( ! f.ok ) {
			say( f.where, `an iframe without a sandbox attribute. Give it sandbox="" with only the allow- tokens it needs.` );
		}
	}

	const prefix = slug.replace( /-/g, '_' );
	for ( const [ kind, list ] of [ [ 'scripts', m.scripts || [] ], [ 'modules', m.modules || [] ] ] ) {
		for ( const s of found[ kind ] ) {
			if ( ! list.includes( s.value ) ) {
				say( s.where, `the script${ kind === 'modules' ? ' module' : '' } '${ s.value }' is not in ${ kind } in ${ manifestFile }. Declare it.` );
			}
			if ( ! s.value.startsWith( prefix ) && ! s.value.startsWith( '@' + prefix ) ) {
				say( s.where, `the script handle '${ s.value }' doesn't start with '${ prefix }'. Name it after the plugin, so it can't collide with another's.` );
			}
		}
		for ( const name of list ) {
			if ( ! found[ kind ].some( ( s ) => s.value === name ) ) {
				say( manifestFile, `${ kind } names '${ name }', which the code doesn't register. Take it out.` );
			}
		}
	}

	if ( extension ) {
		const uses = m.riff || {};
		const ownClass = m.namespace;
		for ( const [ kind, list, label ] of [
			[ 'hooks', riff.hooks, 'Riff hook' ],
			[ 'functions', riff.functions, 'Riff function' ],
			[ 'events', riff.events, 'player action' ],
			[ 'api', riff.api, 'window.riff member' ],
		] ) {
			const declared = uses[ kind ] || [];
			const seen = [ ...new Set( found[ kind ].map( ( x ) => x.value ) ) ];
			for ( const x of found[ kind ] ) {
				if ( kind === 'functions' && ! list.includes( x.value ) && ! x.value.startsWith( slug.replace( /-/g, '_' ) ) ) {
					say( x.where, `${ x.value }() is not one of Riff's public functions (plugins/riff/src/functions.php). Use the public API, or add what you need to it as a documented extension point.` );
					continue;
				}
				if ( kind === 'functions' && ! list.includes( x.value ) ) {
					continue;
				}
				if ( kind !== 'functions' && ! list.includes( x.value ) ) {
					say( x.where, `the ${ label } '${ x.value }' is not public (docs/hooks.md, docs/javascript.md). Use one that is, or make it public in Riff first.` );
				} else if ( ! declared.includes( x.value ) ) {
					say( x.where, `it uses the ${ label } '${ x.value }', which is not in riff.${ kind } in ${ manifestFile }. Declare it.` );
				}
			}
			for ( const name of declared ) {
				if ( ! seen.includes( name ) ) {
					say( manifestFile, `riff.${ kind } names '${ name }', which the code doesn't use. Take it out.` );
				}
			}
		}
		for ( const c of found.classes ) {
			if ( ! ownClass || ! c.value.startsWith( ownClass ) ) {
				say( c.where, `it reaches into Riff\\${ c.value }, one of Riff's classes. An extension uses Riff's hooks, functions, REST routes and window.riff, never its classes.` );
			}
		}
		for ( const i of found.imports ) {
			if ( /^riff-player\b|^riff\b|\/plugins\/riff\//.test( i.value ) ) {
				say( i.where, `it imports ${ i.value }, one of Riff's own modules. Use window.riff and the riff: events instead.` );
			}
		}
	}
	return errors;
}

// ---- What Riff makes public, from the generated references and functions.php.

function riffSurface() {
	const hooksDoc = fs.readFileSync( path.join( ROOT, 'docs', 'hooks.md' ), 'utf8' );
	const jsDoc = fs.readFileSync( path.join( ROOT, 'docs', 'javascript.md' ), 'utf8' );
	const functions = fs.readFileSync( path.join( PLUGINS, 'riff', 'src', 'functions.php' ), 'utf8' );
	return {
		hooks: [ ...hooksDoc.matchAll( /^### `(riff_[a-z_]+)`/gm ) ].map( ( x ) => x[ 1 ] ),
		events: [ ...hooksDoc.matchAll( /^#### `riff\.([a-z_]+)`/gm ) ].map( ( x ) => x[ 1 ] ),
		api: [ ...jsDoc.matchAll( /^### `window\.riff\.([a-zA-Z]+)/gm ) ].map( ( x ) => x[ 1 ] ),
		functions: [ ...functions.matchAll( /^function (riff_[a-z_]+)\(/gm ) ].map( ( x ) => x[ 1 ] ),
	};
}

/**
 * Every plugin under plugins/ that has a main file, by slug.
 *
 * @return {string[]}
 */
function plugins() {
	return fs
		.readdirSync( PLUGINS, { withFileTypes: true } )
		.filter( ( d ) => d.isDirectory() && fs.existsSync( path.join( PLUGINS, d.name, `${ d.name }.php` ) ) )
		.map( ( d ) => d.name );
}

const SCHEMA_KEYS = [ '$schema', 'plugin', 'namespace', 'data', 'rest', 'capabilities', 'hosts', 'spawn', 'riff', 'scripts', 'modules', 'sandbox' ];

/**
 * Reads every manifest, and the problems with their shape.
 *
 * @return {{manifests: Object<string, Object>, errors: string[]}}
 */
function manifests() {
	const out = {};
	const errors = [];
	for ( const slug of plugins() ) {
		const file = path.join( PLUGINS, slug, 'isolation.json' );
		const rel = path.relative( ROOT, file );
		if ( ! fs.existsSync( file ) ) {
			errors.push( `${ rel }: missing. Every plugin declares what it needs; see ${ DOC } for the schema.` );
			continue;
		}
		let m;
		try {
			m = JSON.parse( fs.readFileSync( file, 'utf8' ) );
		} catch ( e ) {
			errors.push( `${ rel }: not JSON (${ e.message }).` );
			continue;
		}
		if ( m.plugin !== slug ) {
			errors.push( `${ rel }: "plugin" is ${ JSON.stringify( m.plugin ) }; it is the folder's name, "${ slug }".` );
		}
		for ( const k of Object.keys( m ) ) {
			if ( ! SCHEMA_KEYS.includes( k ) ) {
				errors.push( `${ rel }: "${ k }" is not part of the schema in ${ DOC }.` );
			}
		}
		out[ slug ] = m;
	}
	return { manifests: out, errors };
}

function run( argv = process.argv.slice( 2 ) ) {
	const { manifests: all, errors } = manifests();
	const riff = riffSurface();
	const found = {};
	for ( const slug of plugins() ) {
		found[ slug ] = scan( path.join( PLUGINS, slug ) );
		if ( all[ slug ] ) {
			errors.push( ...check( slug, found[ slug ], all, riff ) );
		}
	}
	if ( argv.includes( '--found' ) ) {
		const brief = {};
		for ( const [ slug, f ] of Object.entries( found ) ) {
			brief[ slug ] = Object.fromEntries(
				Object.entries( f ).map( ( [ k, list ] ) => [
					k,
					[ ...new Set( list.map( ( x ) => x.value ?? x.route ?? x.where ) ) ],
				] )
			);
		}
		process.stdout.write( JSON.stringify( brief, null, '\t' ) + '\n' );
		return 0;
	}
	if ( errors.length ) {
		process.stderr.write( `isolation: ${ errors.length } problem${ errors.length === 1 ? '' : 's' } (${ DOC }):\n` );
		for ( const e of errors ) {
			process.stderr.write( `  ${ e }\n` );
		}
		return 1;
	}
	process.stdout.write( `isolation: ${ Object.keys( all ).length } plugins keep to their isolation.json\n` );
	return 0;
}

if ( require.main === module ) {
	process.exitCode = run();
}

module.exports = { stripPhp, stripJs, scan, check, resolve, constants, hostAllowed, owner, riffSurface, manifests, run };
