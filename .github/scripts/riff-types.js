#!/usr/bin/env node
/**
 * TypeScript declarations for Riff, from the same sources as the references, so they cannot say
 * something the code does not:
 *
 * - the REST routes, their arguments and response schemas, the track schema and the REST field on
 *   media, from the plugin's own registration code run by surface.php;
 * - window.riff, from the player's docblocks, as js-reference.js reads them;
 * - the riff.* actions and filters, and the riff:* events that repeat each action, from the hooks'
 *   docblocks, as hooks-reference.js reads them;
 * - a Listen app view, from the array shape Views::all() documents for the riff_app_views filter.
 *
 * It writes packages/types/index.d.ts, which is committed. --check fails when that file is not what
 * the code would generate now.
 *
 * Usage: node .github/scripts/riff-types.js [--check]
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { execFileSync } = require( 'node:child_process' );
const hooks = require( './hooks-reference.js' );
const js = require( './js-reference.js' );

const ROOT = path.resolve( __dirname, '..', '..' );
const OUT = path.join( ROOT, 'packages', 'types', 'index.d.ts' );
const VIEWS = path.join( ROOT, 'plugins', 'riff', 'features', 'listen', 'class-views.php' );

/** What surface.php reports: routes, the REST field, the track schema. */
const surface = () => JSON.parse( execFileSync( 'php', [ path.join( __dirname, 'surface.php' ) ], { encoding: 'utf8' } ) );

// ---- JSON Schema to TypeScript.

/**
 * A name for a schema's title: riff-library-post is LibraryPost.
 * @param title
 */
const pascal = ( title ) =>
	title
		.replace( /^riff-/, '' )
		.split( /[^a-z0-9]+/i )
		.map( ( w ) => w.charAt( 0 ).toUpperCase() + w.slice( 1 ) )
		.join( '' );

const isIdentifier = ( key ) => /^[A-Za-z_$][\w$]*$/.test( key );
const key = ( k ) => ( isIdentifier( k ) ? k : JSON.stringify( k ) );

/**
 * A docblock for a description, or nothing.
 * @param text
 * @param pad
 */
const doc = ( text, pad ) => ( text ? `${ pad }/** ${ String( text ).replace( /\*\//g, '*\\/' ).replace( /\s+/g, ' ' ).trim() } */\n` : '' );

const sameShape = ( a, b ) => JSON.stringify( a ) === JSON.stringify( b );

/**
 * A JSON Pointer within a schema.
 *
 * @param {Object} root    The schema the pointer is in.
 * @param {string} pointer Such as `#/properties/blocks/items`.
 * @return {Object|undefined} What it points at.
 */
function resolve( root, pointer ) {
	if ( ! pointer.startsWith( '#' ) ) {
		return undefined;
	}
	return pointer
		.slice( 1 )
		.split( '/' )
		.filter( Boolean )
		.map( ( p ) => p.replace( /~1/g, '/' ).replace( /~0/g, '~' ) )
		.reduce( ( at, p ) => ( at === undefined ? at : at[ p ] ), root );
}

/**
 * The TypeScript for a JSON schema.
 *
 * @param {Object} schema The schema.
 * @param {Object} ctx    { root, named: Map of title to type name, track, self, pad }.
 * @return {string} A type.
 */
function tsOf( schema, ctx ) {
	if ( ! schema || typeof schema !== 'object' ) {
		return 'unknown';
	}
	const pad = ctx.pad || '';
	if ( schema.$ref ) {
		const target = resolve( ctx.root, schema.$ref );
		if ( target && target.title && ctx.named.has( target.title ) ) {
			return ctx.named.get( target.title );
		}
		return 'unknown';
	}
	if ( typeof schema.title === 'string' && ctx.named.has( schema.title ) && schema.title !== ctx.self ) {
		return ctx.named.get( schema.title );
	}
	const types = [].concat( schema.type || [] );
	// The track schema, wherever a route repeats it whole.
	// The track schema, wherever a route repeats it, whole or with keys of its own added.
	if ( ctx.track && ctx.self !== ctx.track.title && schema.properties && Object.entries( ctx.track.properties ).every( ( [ k, v ] ) => sameShape( schema.properties[ k ], v ) ) ) {
		const extra = Object.fromEntries( Object.entries( schema.properties ).filter( ( [ k ] ) => ! ( k in ctx.track.properties ) ) );
		const type = Object.keys( extra ).length ? `Track & ${ tsOf( { type: 'object', properties: extra }, { ...ctx, self: null } ) }` : 'Track';
		return types.includes( 'null' ) ? `${ type.includes( '&' ) ? `(${ type })` : type } | null` : type;
	}
	for ( const many of [ 'oneOf', 'anyOf' ] ) {
		if ( Array.isArray( schema[ many ] ) ) {
			return union( schema[ many ].map( ( s ) => tsOf( s, { ...ctx, self: null } ) ) );
		}
	}
	if ( Array.isArray( schema.enum ) ) {
		return union( schema.enum.map( ( v ) => JSON.stringify( v ) ) );
	}
	if ( types.length > 1 ) {
		return union( types.map( ( t ) => tsOf( { ...schema, type: t }, ctx ) ) );
	}
	switch ( types[ 0 ] ) {
		case 'string':
			return 'string';
		case 'integer':
		case 'number':
			return 'number';
		case 'boolean':
			return 'boolean';
		case 'null':
			return 'null';
		case 'array': {
			const item = tsOf( schema.items, { ...ctx, self: null } );
			return /[\s|&]/.test( item ) && ! /^\{/.test( item ) ? `Array<${ item }>` : `${ item }[]`;
		}
		case 'object':
		case undefined: {
			if ( ! schema.properties ) {
				return types[ 0 ] === 'object' ? 'Record<string, unknown>' : 'unknown';
			}
			const required = Array.isArray( schema.required ) ? schema.required : null;
			const inner = { ...ctx, self: null, pad: pad + '\t' };
			const lines = Object.entries( schema.properties ).map( ( [ k, prop ] ) => {
				const optional = required ? ! required.includes( k ) : false;
				return `${ doc( prop.description, pad + '\t' ) }${ pad }\t${ key( k ) }${ optional ? '?' : '' }: ${ tsOf( prop, inner ) };`;
			} );
			return `{\n${ lines.join( '\n' ) }\n${ pad }}`;
		}
		default:
			return 'unknown';
	}
}

/**
 * Types joined, each once, null last.
 * @param list
 */
function union( list ) {
	const seen = [ ...new Set( list ) ];
	seen.sort( ( a, b ) => ( a === 'null' ) - ( b === 'null' ) );
	return seen.join( ' | ' );
}

// ---- REST.

/**
 * A route's address as the client takes it: /users/(?P<user>me|\d+)/likes is /users/{user}/likes.
 *
 * @param {string} ns    Namespace.
 * @param {string} route Route, as registered.
 * @return {{ path: string, names: string[] }} The address and its parameters.
 */
function address( ns, route ) {
	const names = [];
	const p = route.replace( /\(\?P<(\w+)>[^)]*\)/g, ( _, name ) => {
		names.push( name );
		return `{${ name }}`;
	} );
	return { path: `/${ ns }${ p }`, names };
}

/**
 * The request a method takes: the parameters in the address, then its arguments, each optional
 * unless it is required and has no default.
 *
 * @param {Object}   args  Arguments, as registered.
 * @param {string[]} names Parameters in the address.
 * @param {Object}   ctx   Context for tsOf().
 * @return {string} A type.
 */
function requestOf( args, names, ctx ) {
	const entries = Object.entries( args || {} );
	if ( ! entries.length ) {
		return 'Record<string, never>';
	}
	const lines = entries.map( ( [ k, a ] ) => {
		const optional = ! names.includes( k ) && ( ! a.required || a.default !== undefined );
		return `${ doc( a.description, '\t\t\t' ) }\t\t\t${ key( k ) }${ optional ? '?' : '' }: ${ tsOf( a, { ...ctx, pad: '\t\t\t' } ) };`;
	} );
	return `{\n${ lines.join( '\n' ) }\n\t\t}`;
}

/**
 * The declarations for the REST API: the track, each route's response, and the Routes map.
 *
 * @param {Object} s What surface.php reports.
 * @return {string} TypeScript.
 */
function rest( s ) {
	const named = new Map( [ [ s.track.title, 'Track' ] ] );
	const shapes = [];
	const add = ( schema, root, name ) => {
		if ( ! schema?.title || named.has( schema.title ) ) {
			return;
		}
		named.set( schema.title, name );
		shapes.push( { title: schema.title, name, schema, root } );
	};
	for ( const r of s.routes ) {
		if ( ! r.schema ) {
			continue;
		}
		add( r.schema, r.schema, `${ pascal( r.schema.title ) }Response` );
		// A shape a schema names inside itself, as a block names the blocks inside it.
		JSON.stringify( r.schema, ( k, v ) => {
			if ( v && typeof v === 'object' && typeof v.title === 'string' && v.properties && v !== r.schema && ! named.has( v.title ) ) {
				add( v, r.schema, pascal( v.title ) );
			}
			return v;
		} );
	}

	let out = section( 'The track', 'One shape for a track: the REST field on media, the routes, the block markup and the player all use it. Riff\\Tracks::schema(), version ' + s.version + '.' );
	out += `export interface Track ${ tsOf( s.track, { root: s.track, named, track: s.track, self: s.track.title } ) }\n\n`;
	out += `/** The track schema's version, Riff\\\\Tracks::SCHEMA_VERSION. */\nexport type TrackSchemaVersion = ${ JSON.stringify( s.version ) };\n\n`;

	out += section( 'REST responses', 'What each riff/v1 route answers, by the title of its schema.' );
	for ( const shape of shapes ) {
		const body = tsOf( shape.schema, { root: shape.root, named, track: s.track, self: shape.title } );
		out += doc( shape.schema.description, '' );
		out += body.startsWith( '{' ) ? `export interface ${ shape.name } ${ body }\n\n` : `export type ${ shape.name } = ${ body };\n\n`;
	}
	// The shapes a client reads most, by the names the reference gives them.
	const aliases = [
		[ 'Album', 'riff-albums', "['items'][number]", 'An album, as riff/v1/albums lists it.' ],
		[ 'Artist', 'riff-artists', "['items'][number]", 'An artist, as riff/v1/artists lists it.' ],
		[ 'Playlist', 'riff-playlist', '', 'A listener\'s playlist, as riff/v1/users/{user}/playlists/{id} answers.' ],
		[ 'LibraryItem', 'riff-library', "['items'][number]", 'A post with tracks, as riff/v1/library lists it.' ],
	];
	for ( const [ name, title, pick, words ] of aliases ) {
		if ( named.has( title ) ) {
			out += `${ doc( words, '' ) }export type ${ name } = ${ named.get( title ) }${ pick };\n\n`;
		}
	}

	for ( const f of s.fields ) {
		out += doc( `What Riff adds to each item of the ${ f.type } REST route (wp/v2/media).`, '' );
		out += `export interface ${ pascal( f.type ) }Fields {\n${ doc( f.schema?.description, '\t' ) }\t${ key( f.name ) }: ${ tsOf( f.schema, { root: f.schema, named, track: s.track } ) };\n}\n\n`;
	}

	out += section( 'REST routes', 'Every route, by method and address, with what it takes and what it answers. The parameters in the address are part of params.' );
	out += 'export interface Routes {\n';
	for ( const r of s.routes ) {
		const { path: p, names } = address( r.namespace, r.route );
		const response = r.schema?.title ? named.get( r.schema.title ) : 'unknown';
		for ( const e of r.endpoints ) {
			for ( const method of String( e.methods ).split( /[\s,]+/ ).filter( Boolean ) ) {
				out += doc( r.schema?.description || '', '\t' );
				out += `\t${ JSON.stringify( `${ method } ${ p }` ) }: {\n\t\tparams: ${ requestOf( e.args, names, { root: r.schema, named, track: s.track } ) };\n\t\tresponse: ${ response };\n\t};\n`;
			}
		}
	}
	out += '}\n\n';
	out += '/** A route, as `METHOD /namespace/address`. */\nexport type Route = keyof Routes;\n\n';
	return out;
}

// ---- JavaScript: window.riff, its hooks and events.

/**
 * A top-level split of a type at `|`, leaving the ones inside parentheses or brackets.
 * @param type
 * @param sep
 */
function topLevel( type, sep = '|' ) {
	const parts = [];
	let depth = 0;
	let at = 0;
	for ( let i = 0; i < type.length; i++ ) {
		const c = type[ i ];
		if ( '([{<'.includes( c ) ) {
			depth++;
		} else if ( ')]}>'.includes( c ) && type[ i - 1 ] !== '=' ) {
			depth--;
		} else if ( c === sep && ! depth ) {
			parts.push( type.slice( at, i ).trim() );
			at = i + 1;
		}
	}
	parts.push( type.slice( at ).trim() );
	return parts;
}

/**
 * Whether a type is all inside one pair of parentheses: `((a) => b)`, not `(a) => b`.
 * @param type
 */
function wrapped( type ) {
	if ( ! type.startsWith( '(' ) ) {
		return false;
	}
	let depth = 0;
	for ( let i = 0; i < type.length; i++ ) {
		depth += type[ i ] === '(' ? 1 : type[ i ] === ')' ? -1 : 0;
		if ( ! depth ) {
			return i === type.length - 1;
		}
	}
	return false;
}

/**
 * Whether a parameter or a return is a track, or a list of them, by what it is called or said to
 * be: `track`, `tracks`, `queue`, or "in the shape `Tracks::schema()` describes".
 *
 * @param {string} name        The parameter, last part only.
 * @param {string} description Its words.
 * @return {boolean} Whether it is.
 */
const isTrack = ( name, description = '' ) => /^(track|tracks|queue)$/.test( name ) || /Tracks::schema\(\)/.test( description ) || /^(The )?tracks?\b/i.test( description );

/**
 * A JSDoc type as TypeScript.
 *
 * @param {string} type        The JSDoc type.
 * @param {string} name        What it is called, for telling a track from any other object.
 * @param {string} description Its words.
 * @return {string} A type.
 */
function tsJs( type, name = '', description = '' ) {
	let t = String( type || '' ).trim();
	if ( ! t || t === '*' ) {
		return 'unknown';
	}
	if ( t.startsWith( '?' ) ) {
		return union( [ tsJs( t.slice( 1 ), name, description ), 'null' ] );
	}
	const parts = topLevel( t );
	if ( parts.length > 1 ) {
		return union(
			parts.map( ( p ) => {
				// `((track: Object|null) => string)`: the parentheses that keep a function in a union.
				const bare = wrapped( p ) ? p.slice( 1, -1 ).trim() : p;
				const ts = tsJs( bare, name, description );
				return /=>/.test( ts ) ? `(${ ts })` : ts;
			} )
		);
	}
	if ( /=>/.test( t ) ) {
		// A function type: each of its own parameters by its name.
		const m = /^\((.*)\)\s*=>\s*(.+)$/s.exec( t );
		if ( m ) {
			const params = m[ 1 ].trim() ? topLevel( m[ 1 ], ',' ).map( ( p ) => {
				const [ n, ...rest ] = p.split( ':' );
				return `${ n.trim() }: ${ tsJs( rest.join( ':' ), n.trim().replace( /\?$/, '' ) ) }`;
			} ) : [];
			const returns = m[ 2 ].trim();
			return `(${ params.join( ', ' ) }) => ${ returns === 'void' ? 'void' : tsJs( returns ) }`;
		}
	}
	if ( t === 'Object' || t === 'object' ) {
		if ( name === 'api' ) {
			return 'RiffApi';
		}
		return isTrack( name, description ) && ! /^(tracks|queue)$/.test( name ) ? 'Track' : 'Record<string, unknown>';
	}
	if ( t === 'Object[]' || t === 'Array<Object>' ) {
		return isTrack( name, description ) ? 'Track[]' : 'Array<Record<string, unknown>>';
	}
	if ( /\[\]$/.test( t ) ) {
		const item = tsJs( t.slice( 0, -2 ), name, description );
		return /[\s|]/.test( item ) ? `Array<${ item }>` : `${ item }[]`;
	}
	t = t.replace( /^Function$/, '(...args: unknown[]) => unknown' ).replace( /^Array$/, 'unknown[]' );
	return t;
}

/**
 * Parameters as TypeScript, with a parameter's documented properties (`options.shuffle`) as the
 * object type it takes.
 *
 * @param {Array}  params Parameters, as hooks.parse() reads them.
 * @param {string} pad    Indent of the parameter list.
 * @return {Array<{ name: string, optional: boolean, type: string }>} One per top-level parameter.
 */
function tsParams( params, pad = '' ) {
	const top = params.filter( ( p ) => ! p.name.includes( '.' ) );
	return top.map( ( p ) => {
		const props = params.filter( ( q ) => q.name.startsWith( `${ p.name }.` ) );
		let type = tsJs( p.type, p.name, p.description );
		if ( props.length && /^Record<string, unknown>$/.test( type ) ) {
			type = `{\n${ props.map( ( q ) => {
				const n = q.name.slice( p.name.length + 1 );
				return `${ doc( q.description, pad + '\t' ) }${ pad }\t${ key( n ) }${ q.optional ? '?' : '' }: ${ tsJs( q.type, n, q.description ) };`;
			} ).join( '\n' ) }\n${ pad }}`;
		}
		return { name: p.name, optional: !! p.optional, type, description: p.description };
	} );
}

/**
 * A parameter list.
 * @param ps
 */
const list = ( ps ) => ps.map( ( p ) => `${ p.name }${ p.optional ? '?' : '' }: ${ p.type }` ).join( ', ' );

/**
 * A JSDoc comment from a summary, a description and @since.
 * @param item
 * @param pad
 */
function jsdoc( item, pad ) {
	const lines = [ item.summary, item.description ].filter( Boolean ).join( '\n\n' ).replace( /\*\//g, '*\\/' ).split( '\n' );
	if ( item.since ) {
		lines.push( '', `@since ${ item.since }` );
	}
	if ( item.deprecated ) {
		lines.push( '@deprecated' );
	}
	return `${ pad }/**\n${ lines.map( ( l ) => `${ pad } *${ l ? ' ' + l : '' }` ).join( '\n' ) }\n${ pad } */\n`;
}

/**
 * window.riff, as an interface.
 *
 * @param {Array} members What js-reference.js reads.
 * @return {string} TypeScript.
 */
function api( members ) {
	let out = section( 'window.riff', 'The player\'s public api, handed to riff.ready and kept on window.riff once the player starts.' );
	out += 'export interface RiffApi {\n';
	for ( const m of members ) {
		out += jsdoc( m, '\t' );
		if ( m.kind === 'property' ) {
			out += `\treadonly ${ key( m.name ) }: ${ tsJs( m.typeTag, m.name, m.summary ) };\n`;
			continue;
		}
		const returns = m.returns ? tsJs( m.returns.type, '', m.returns.description ) : 'void';
		// on() takes an action's name without its prefix, and hands the listener that action's detail.
		const named = m.params[ 0 ] && /action without its prefix/.test( m.params[ 0 ].description );
		if ( named ) {
			out += `\t${ m.name }<K extends keyof RiffEventDetails>(${ m.params[ 0 ].name }: K, ${ m.params[ 1 ]?.name || 'fn' }: (detail: RiffEventDetails[K], api: RiffApi) => void): ${ returns };\n`;
			continue;
		}
		out += `\t${ m.name }(${ list( tsParams( m.params, '\t' ) ) }): ${ returns };\n`;
	}
	out += '}\n\n';
	return out;
}

/**
 * The riff.* actions and filters, and the riff:* events.
 *
 * @param {Array} all Every hook, as hooks-reference.js collects them.
 * @return {string} TypeScript.
 */
function jsHooks( all ) {
	const seen = new Set();
	const actions = [];
	const filters = [];
	for ( const h of all.filter( ( x ) => x.lang === 'js' ) ) {
		if ( seen.has( h.type + h.name ) ) {
			continue;
		}
		seen.add( h.type + h.name );
		( h.type === 'filter' ? filters : actions ).push( h );
	}
	let out = section( 'Actions and filters', 'Through wp.hooks: wp.hooks.addAction( name, namespace, callback ) and wp.hooks.addFilter( name, namespace, callback ), the callback typed here by name.' );
	out += 'export interface RiffActions {\n';
	for ( const h of actions ) {
		out += jsdoc( h, '\t' );
		out += `\t${ JSON.stringify( h.name ) }: (${ list( tsParams( h.params, '\t' ) ) }) => void;\n`;
	}
	out += '}\n\n';
	out += 'export interface RiffFilters {\n';
	for ( const h of filters ) {
		const ps = tsParams( h.params, '\t' );
		out += jsdoc( h, '\t' );
		out += `\t${ JSON.stringify( h.name ) }: (${ list( ps ) }) => ${ ps[ 0 ]?.type || 'unknown' };\n`;
	}
	out += '}\n\n';
	out += '/** An action\'s name, such as riff.play. */\nexport type RiffAction = keyof RiffActions;\n\n';
	out += '/** A filter\'s name, such as riff.queue. */\nexport type RiffFilter = keyof RiffFilters;\n\n';

	out += section( 'Events', 'Each action is also a riff:<name> CustomEvent with the same detail, dispatched on #riff, bubbling; riff:app_view on document. For pages without the WordPress scripts.' );
	out += '/** Each action\'s detail, by its name without the prefix, as window.riff.on() and the events hand it. */\nexport interface RiffEventDetails {\n';
	for ( const h of actions ) {
		out += `\t${ key( h.name.replace( /^riff\./, '' ) ) }: Parameters<RiffActions[${ JSON.stringify( h.name ) }]>[0];\n`;
	}
	out += '}\n\n';
	out += 'export type RiffEventMap = {\n\t[ K in keyof RiffEventDetails as `riff:${ K }` ]: CustomEvent<RiffEventDetails[ K ]>;\n};\n\n';
	out += '/** An event\'s name, such as riff:play. */\nexport type RiffEvent = keyof RiffEventMap;\n\n';
	return out;
}

// ---- riff_app_views.

/**
 * A view of the Listen app, from the array shape Views::all() documents as its @return.
 *
 * @param {string} file class-views.php.
 * @return {string} TypeScript.
 */
function views( file = VIEWS ) {
	const src = fs.readFileSync( file, 'utf8' );
	const m = /@return\s+array<string,\s*array\{(.+)\}>\s*$/m.exec( src );
	if ( ! m ) {
		throw new Error( `No "@return array<string, array{...}>" in ${ path.relative( ROOT, file ) }` );
	}
	const php = ( t ) =>
		union(
			t.split( '|' ).map( ( x ) => {
				x = x.trim();
				const map = { string: 'string', int: 'number', float: 'number', bool: 'boolean', null: 'null', callable: 'PhpCallable', array: 'unknown[]', mixed: 'unknown' };
				return /\[\]$/.test( x ) ? `${ map[ x.slice( 0, -2 ) ] || 'unknown' }[]` : map[ x ] || 'unknown';
			} )
		);
	const fields = topLevel( m[ 1 ], ',' ).map( ( f ) => {
		const [ name, ...type ] = f.split( ':' );
		return `\t${ key( name.trim() ) }: ${ php( type.join( ':' ) ) };`;
	} );
	let out = section( 'Listen app views', 'A view of the Listen app, as the riff_app_views PHP filter leaves it and Riff\\Listen\\Views::all() returns it. A plugin adds one in PHP, under a slug of its own, with a label and a render callback; the rest have defaults.' );
	out += '/** A PHP callable: a function\'s name, or a class or object and a method\'s name. */\nexport type PhpCallable = string | [ string | object, string ];\n\n';
	out += `export interface AppView {\n${ fields.join( '\n' ) }\n}\n\n`;
	out += '/** What a plugin returns from riff_app_views for a view of its own: a label and render, the rest optional. */\nexport type AppViewDefinition = Pick<AppView, \'label\' | \'render\'> & Partial<Omit<AppView, \'label\' | \'render\' | \'own\'>>;\n\n';
	out += '/** The views by slug. */\nexport type AppViews = Record<string, AppView>;\n\n';
	return out;
}

/**
 * A heading comment between sections.
 * @param title
 * @param words
 */
const section = ( title, words ) => `// ---- ${ title }.\n// ${ words }\n\n`;

/**
 * The whole file.
 *
 * @param {Object} data { surface, members, hooks }.
 * @return {string} TypeScript.
 */
function render( data ) {
	let out = '// Riff\'s types: generated by .github/scripts/riff-types.js from the REST schemas, the track schema,\n';
	out += '// the hook docblocks, the window.riff docblocks and Views::all(). Do not edit; run npm run types.\n\n';
	out += rest( data.surface );
	out += api( data.members );
	out += jsHooks( data.hooks );
	out += views( data.views );
	out += section( 'Globals', 'window.riff once the player starts, and the riff:* events on elements and the document.' );
	out += 'declare global {\n\tinterface Window {\n\t\triff?: RiffApi;\n\t}\n\tinterface HTMLElementEventMap extends RiffEventMap {}\n\tinterface DocumentEventMap extends RiffEventMap {}\n}\n';
	return out;
}

/** What the generator reads, from the code as it is. */
const collect = () => ( { surface: surface(), members: js.members(), hooks: hooks.collect(), views: VIEWS } );

/**
 * Whether the file on disk is what the code generates.
 *
 * @param {string} expected What render() gives.
 * @param {string} file     The committed file.
 * @return {string|null} The problem, or null when it is current.
 */
function drift( expected, file = OUT ) {
	if ( ! fs.existsSync( file ) ) {
		return `${ path.relative( ROOT, file ) } is missing: run npm run types`;
	}
	return fs.readFileSync( file, 'utf8' ) === expected ? null : `${ path.relative( ROOT, file ) } is out of date: run npm run types`;
}

function main() {
	const out = render( collect() );
	if ( process.argv.includes( '--check' ) ) {
		const problem = drift( out );
		if ( problem ) {
			console.error( problem );
			process.exit( 1 );
		}
		console.log( `${ path.relative( ROOT, OUT ) } is current` );
		return;
	}
	fs.writeFileSync( OUT, out );
	console.log( `Wrote ${ path.relative( ROOT, OUT ) }` );
}

if ( require.main === module ) {
	main();
}

module.exports = { OUT, tsOf, tsJs, address, render, collect, drift, views };
