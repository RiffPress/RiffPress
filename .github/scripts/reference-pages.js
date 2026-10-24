#!/usr/bin/env node
/**
 * The PHP, REST API and CSS references under /developers/, each read from the code:
 *
 * - PHP: the PHP hooks, the Riff\Source interface and Sources::register() from their docblocks,
 *   the track schema from Tracks::schema(), the abilities from Abilities::list(), and the Listen
 *   block from its block.json.
 * - REST API: the routes, their arguments and response schemas, the REST field on media, and the
 *   WPGraphQL types, from the plugin's own registration code run by surface.php.
 * - CSS: every custom property in tokens.css (the riff-tokens stylesheet) with a docblock, which
 *   is what makes it public.
 *
 * The pages quote line numbers, so they are built at deploy time from the commit being published.
 * --check fails when something public has no docblock or no @since, or the harness cannot run.
 *
 * Usage: node .github/scripts/reference-pages.js [--check]
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { execFileSync } = require( 'node:child_process' );
const { esc, inline, referencePage } = require( './site-shell.js' );
const hooks = require( './hooks-reference.js' );

const ROOT = path.resolve( __dirname, '..', '..' );
const PLUGIN = path.join( ROOT, 'plugins', 'riff' );
const SITE = path.join( ROOT, 'site', 'developers' );
// The deploy fills {{commit}} with the SHA it publishes, so every link opens the code as deployed.
const REPO = 'https://github.com/RiffPress/RiffPress/blob/{{commit}}/';

const rel = ( file ) => path.relative( ROOT, file );
const source = ( file, line ) => `<a href="${ REPO }${ rel( file ) }#L${ line }">View on GitHub</a>`;
const table = ( head, rows ) => `<table class="code-table"><thead><tr>${ head.map( ( h ) => `<th scope="col">${ h }</th>` ).join( '' ) }</tr></thead><tbody>${ rows.join( '' ) }</tbody></table>`;

/**
 * PHP declarations with their docblocks: every `function` in a file, or one named function.
 *
 * @param {string} file Absolute path.
 * @param {string} only A function name to keep, or empty for all.
 * @return {Array} Declarations.
 */
function functionsIn( file, only = '' ) {
	const lines = fs.readFileSync( file, 'utf8' ).split( '\n' );
	const out = [];
	lines.forEach( ( line, i ) => {
		const m = /^\s*((?:(?:public|private|protected|static|final|abstract)\s+)*)function\s+(\w+)\s*\((.*)\)\s*(?::\s*([?\w\\[\]|]+))?/.exec( line );
		if ( ! m || ( only && m[ 2 ] !== only ) || /private|protected/.test( m[ 1 ] ) ) {
			return;
		}
		const block = hooks.docblockAbove( lines, i );
		out.push( {
			name: m[ 2 ],
			signature: line.trim().replace( /\s*[{;]\s*$/, '' ),
			arity: m[ 3 ].trim() ? m[ 3 ].split( ',' ).length : 0,
			file,
			line: i + 1,
			...hooks.parse( block ? block.text : null ),
		} );
	} );
	return out;
}

/** The docblock above the interface itself. */
function interfaceDoc( file ) {
	const lines = fs.readFileSync( file, 'utf8' ).split( '\n' );
	const i = lines.findIndex( ( l ) => /^interface\s+\w+/.test( l ) );
	const block = hooks.docblockAbove( lines, i );
	return { line: i + 1, ...hooks.parse( block ? block.text : null ) };
}

/**
 * Every public custom property: a declaration in tokens.css with a docblock above it.
 *
 * @param {string} file The stylesheet.
 * @return {Array} Properties, with the selector they are set on.
 */
function customProperties( file = path.join( PLUGIN, 'assets', 'tokens.css' ) ) {
	const lines = fs.readFileSync( file, 'utf8' ).split( '\n' );
	const out = [];
	let selector = '';
	lines.forEach( ( line, i ) => {
		const open = /^\s*([^{}/@][^{}]*?)\s*\{\s*$/.exec( line );
		if ( open ) {
			selector = open[ 1 ];
		}
		const m = /^\s*(--riff-[\w-]+)\s*:\s*(.+?);\s*$/.exec( line );
		if ( ! m || ! /\*\/\s*$/.test( lines[ i - 1 ] ) ) {
			return;
		}
		// Only a docblock makes a property public; a plain comment such as a stylelint directive
		// above it does not.
		let k = i - 1;
		while ( k > 0 && ! /\/\*/.test( lines[ k ] ) ) {
			k--;
		}
		if ( ! /\/\*\*/.test( lines[ k ] ) ) {
			return;
		}
		if ( out.some( ( p ) => p.name === m[ 1 ] ) ) {
			return;
		}
		const block = hooks.docblockAbove( lines, i );
		out.push( { name: m[ 1 ], value: m[ 2 ], selector, file, line: i + 1, ...hooks.parse( block ? block.text : null ) } );
	} );
	return out;
}

/** What surface.php reports: routes, the REST field, the GraphQL types, the track schema. */
function surface() {
	return JSON.parse( execFileSync( 'php', [ path.join( __dirname, 'surface.php' ) ], { encoding: 'utf8' } ) );
}

function collect() {
	const iface = path.join( PLUGIN, 'src', 'interface-source.php' );
	return {
		hooks: hooks.pages( hooks.collect().filter( ( h ) => h.lang === 'php' ) ),
		sourceDoc: interfaceDoc( iface ),
		sourceMethods: functionsIn( iface ),
		register: functionsIn( path.join( PLUGIN, 'src', 'class-sources.php' ), 'register' )[ 0 ],
		unregister: functionsIn( path.join( PLUGIN, 'src', 'class-sources.php' ), 'unregister' )[ 0 ],
		shortcode: functionsIn( path.join( PLUGIN, 'features', 'listen', 'class-app.php' ), 'shortcode' )[ 0 ],
		block: JSON.parse( fs.readFileSync( path.join( PLUGIN, 'features', 'listen', 'block', 'block.json' ), 'utf8' ) ),
		properties: customProperties(),
		surface: surface(),
	};
}

/**
 * What the references cannot describe truthfully.
 *
 * @param {Object} data From collect().
 * @return {string[]} Problems.
 */
function problems( data ) {
	const out = [];
	const need = ( what, d ) => {
		if ( ! d || ! d.documented ) {
			out.push( `${ what } has no docblock` );
		} else if ( ! d.since ) {
			out.push( `${ what } has no @since` );
		} else if ( ! d.summary ) {
			out.push( `${ what } has no summary line` );
		}
	};
	need( 'The Riff\\Source interface', data.sourceDoc );
	for ( const m of data.sourceMethods ) {
		need( `Riff\\Source::${ m.name }()`, m );
		if ( m.documented && m.params.length !== m.arity ) {
			out.push( `Riff\\Source::${ m.name }() takes ${ m.arity } parameter${ m.arity === 1 ? '' : 's' } but documents ${ m.params.length } @param` );
		}
	}
	need( 'Riff\\Sources::register()', data.register );
	need( 'Riff\\Sources::unregister()', data.unregister );
	need( 'The [riff] shortcode, App::shortcode()', data.shortcode );
	if ( ! data.surface.abilities?.length ) {
		out.push( 'no abilities are registered' );
	}
	for ( const a of data.surface.abilities || [] ) {
		if ( ! a.label || ! a.description ) {
			out.push( `the ability ${ a.name } has no label or description` );
		}
	}
	if ( ! data.properties.length ) {
		out.push( 'tokens.css has no documented custom properties' );
	}
	for ( const p of data.properties ) {
		need( `The custom property ${ p.name }`, p );
	}
	for ( const r of data.surface.routes ) {
		for ( const [ name, arg ] of Object.entries( r.args ) ) {
			if ( ! arg.description ) {
				out.push( `The ${ name } argument of ${ r.namespace }${ r.route } has no description` );
			}
		}
		if ( ! r.schema ) {
			out.push( `${ r.namespace }${ r.route } has no schema` );
		}
	}
	return out;
}

/**
 * The properties of a JSON schema as rows, with nested object and array-of-object properties
 * flattened as parent.child and parent[].child.
 *
 * @param {Object} schema JSON schema of an object.
 * @param {string} prefix Name so far.
 * @return {Array} [ name, type, description ] rows.
 */
function schemaRows( schema, prefix = '' ) {
	const rows = [];
	for ( const [ name, prop ] of Object.entries( schema.properties || {} ) ) {
		const full = prefix + name;
		const type = [].concat( prop.type || '' ).join( ' | ' ) + ( prop.enum ? ` (${ prop.enum.join( ', ' ) })` : '' );
		rows.push( [ full, type, prop.description || '' ] );
		if ( prop.properties ) {
			rows.push( ...schemaRows( prop, `${ full }.` ) );
		}
		if ( prop.items?.properties ) {
			rows.push( ...schemaRows( prop.items, `${ full }[].` ) );
		}
	}
	return rows;
}

const schemaTable = ( schema ) => table( [ 'Property', 'Type', 'Description' ], schemaRows( schema ).map( ( [ n, t, d ] ) => `<tr><td><code>${ esc( n ) }</code></td><td><span class="type">${ esc( t ) }</span></td><td>${ inline( d ) }</td></tr>` ) );

function member( m, title ) {
	let html = `<section class="member" id="${ esc( m.name.toLowerCase() ) }"><h3 class="code-title member-title"><a href="#${ esc( m.name.toLowerCase() ) }">${ esc( title || m.signature ) }</a></h3><p>${ inline( m.summary ) }</p>`;
	if ( m.description ) {
		html += m.description.split( '\n\n' ).map( ( p ) => `<p>${ inline( p ) }</p>` ).join( '' );
	}
	if ( m.params.length ) {
		html += '<div class="parameters"><h4>Parameters</h4><dl>' + m.params.map( ( p ) => `<dt><code>${ esc( p.name ) }</code><span class="type">${ esc( p.type ) }</span></dt><dd><div class="desc">${ inline( p.description ) }</div></dd>` ).join( '' ) + '</dl></div>';
	}
	if ( m.returns ) {
		html += `<div class="parameters"><h4>Return</h4><p><span class="type">${ esc( m.returns.type ) }</span> ${ inline( m.returns.description ) }</p></div>`;
	}
	return html + `<p class="dot-links"><span>Since ${ esc( m.since ) }</span><span class="file"><code>${ esc( rel( m.file ) ) }</code></span>${ source( m.file, m.line ) }</p></section>\n`;
}

const hookRows = ( list ) => list.map( ( h ) => `<tr><td><a href="../hooks/${ h.slug }/">${ esc( h.name ) }</a></td><td>${ inline( h.summary ) }</td></tr>` );

// ---- /developers/php/

function phpPage( data ) {
	const filters = data.hooks.filter( ( h ) => h.type === 'filter' );
	const actions = data.hooks.filter( ( h ) => h.type === 'action' );
	let body = '<section class="summary"><p>Riff is built the way a feature plugin is: one track shape everywhere, read through WordPress\'s own APIs. Everything here is public and keeps working within a major version; anything that has to go is deprecated for a release first.</p></section>\n';

	body += `<section>${ hooks.h2( 'hooks', 'Hooks' ) }<p>Every filter and action has a page of its own, generated from the docblock above the line it fires on. <a href="../hooks/">All hooks</a>, PHP and JavaScript, are searchable in one list.</p>`;
	body += `<h3 id="filters" class="is-toc-heading"><a href="#filters">Filters</a></h3>${ table( [ 'Filter', 'Description' ], hookRows( filters ) ) }`;
	body += `<h3 id="actions" class="is-toc-heading"><a href="#actions">Actions</a></h3>${ table( [ 'Action', 'Description' ], hookRows( actions ) ) }</section>\n`;

	body += `<section>${ hooks.h2( 'sources', 'Sources' ) }<p>${ inline( data.sourceDoc.summary ) }</p>`;
	body += data.sourceDoc.description.split( '\n\n' ).filter( Boolean ).map( ( p ) => `<p>${ inline( p ) }</p>` ).join( '' );
	body += '<p>A plugin adds its own post type or catalogue by implementing <code>Riff\\Source</code> and registering it on <code>init</code>; the library, the REST routes and the player then read it like any other.</p>';
	body += hooks.codeBlock( `add_action( 'init', function () {
	Riff\\Sources::register( new My_Catalogue_Source() );
} );` );
	body += `<h3 id="the-source-interface" class="is-toc-heading"><a href="#the-source-interface">The <code>Riff\\Source</code> interface</a></h3></section>\n`;
	for ( const m of data.sourceMethods ) {
		body += member( m );
	}
	body += member( data.register, 'Riff\\Sources::register( Source $source ): void' );
	body += member( data.unregister, 'Riff\\Sources::unregister( string $id ): void' );

	const gqlComplete = Object.keys( data.surface.track.properties ).every( ( p ) => ( data.surface.gql_types.RiffTrack?.fields || {} )[ p ] );
	body += `<section>${ hooks.h2( 'track-schema', 'The track schema' ) }<p>One shape for a track: the REST field and routes, the block markup and the player script all use it, and WPGraphQL carries <a href="../rest/#graphql">${ gqlComplete ? 'all of it' : 'most of it' }</a>. It is <code>Riff\\Tracks::schema()</code>, version <code>${ data.surface.version }</code>, and a track still matches it after the <a href="../hooks/riff_track/"><code>riff_track</code></a> filter.</p>${ schemaTable( data.surface.track ) }</section>\n`;

	const supports = Object.entries( data.block.supports || {} ).filter( ( [ , v ] ) => v ).map( ( [ k ] ) => k );
	if ( data.surface.abilities?.length ) {
		const rows = data.surface.abilities.map( ( a ) => {
			const args = Object.entries( a.input?.properties || {} ).map( ( [ k, v ] ) => `<code>${ esc( k ) }</code>${ ( a.input.required || [] ).includes( k ) ? ' (required)' : '' }: ${ inline( v.description || '' ) }` ).join( '<br>' );
			return `<tr><td><code>${ esc( a.name ) }</code></td><td>${ inline( a.description ) }</td><td>${ args || '–' }</td><td>${ a.readonly ? 'Read only' : 'Writes' }</td></tr>`;
		} );
		body += `<section>${ hooks.h2( 'abilities', 'Abilities' ) }<p>Through the <a href="https://developer.wordpress.org/apis/abilities-api/">Abilities API</a>, AI tools and other plugins list the library and keep a listener's likes and playlists. Each ability runs its <a href="../rest/#routes"><code>riff/v1</code> route</a> as a REST request, so it answers what the route answers and is allowed what the route allows; the ones about likes, history and playlists need a signed-in user. Nothing plays through an ability: playback happens in a browser.</p>${ hooks.codeBlock( "$albums = wp_get_ability( 'riff/albums' )->execute( array( 'search' => 'Compositions' ) );" ) }${ table( [ 'Ability', 'What it does', 'Input', '' ], rows ) }</section>\n`;
	}
	body += `<section>${ hooks.h2( 'the-listen-block', 'The Listen block' ) }<p><code>${ esc( data.block.name ) }</code>: ${ inline( data.block.description ) } One per page. It supports ${ supports.map( ( s ) => `<code>${ esc( s ) }</code>` ).join( ', ' ) }.</p>${ hooks.codeBlock( `<!-- wp:${ data.block.name } {"align":"full"} /-->` ) }<p>Anywhere blocks are not an option, the <code>[riff]</code> shortcode does the same.</p></section>\n`;
	body += member( data.shortcode, '[riff]' );

	return referencePage( {
		title: 'PHP | RiffPress',
		description: 'Riff\'s PHP surface: every hook, the Source interface for your own tracks, the track schema, the abilities and the Listen block.',
		url: 'developers/php/',
		current: 'php',
		trail: [ [ 'PHP' ] ],
		h1: '<h1>PHP</h1>',
		toc: [
			[ 'hooks', 'Hooks', [ [ 'filters', 'Filters' ], [ 'actions', 'Actions' ] ] ],
			[ 'sources', 'Sources', [ [ 'the-source-interface', 'The Source interface' ] ] ],
			[ 'track-schema', 'The track schema' ],
			[ 'abilities', 'Abilities' ],
			[ 'the-listen-block', 'The Listen block' ],
		],
		body,
	} );
}

// ---- /developers/rest/

function restPage( data ) {
	const s = data.surface;
	let body = '<section class="summary"><p>Everything here describes itself: send <code>OPTIONS</code> to a route for its arguments and schema. The tables below come from the same registration code.</p><p>The track on media is public and keeps its shape within a major version. The <code>riff/v1</code> routes are the player\'s own, there for the player and the Listen block to call, and may change in any release.</p></section>\n';

	body += `<section>${ hooks.h2( 'media', 'The track on media' ) }`;
	for ( const f of s.fields ) {
		body += `<p>Every audio and video item in <code>wp/v2/media</code> carries <code>${ esc( f.name ) }</code>: ${ inline( f.schema?.description || '' ) } It is read only, and <code>null</code> for any other file. Its shape is <a href="../php/#track-schema">the track schema</a>.</p>`;
	}
	body += hooks.codeBlock( 'GET /wp-json/wp/v2/media/123?_fields=id,riff_track' ) + '</section>\n';

	body += `<section>${ hooks.h2( 'routes', 'Routes' ) }`;
	const toc = [];
	for ( const r of s.routes ) {
		const shown = `/${ r.namespace }${ r.route.replace( /\(\?P<(\w+)>[^)]+\)/g, '{$1}' ) }`;
		const id = shown.replace( /[^a-z0-9]+/gi, '-' ).replace( /^-|-$/g, '' ).toLowerCase();
		toc.push( [ id, shown ] );
		body += `<section class="member" id="${ id }"><h3 class="code-title member-title"><a href="#${ id }">${ r.methods.map( esc ).join( ', ' ) } ${ esc( shown ) }</a></h3>`;
		body += `<p>${ inline( r.schema?.description || r.schema?.title || '' ) }</p>`;
		const args = Object.entries( r.args );
		if ( args.length ) {
			body += '<h4>Arguments</h4>' + table( [ 'Name', 'Type', 'Description' ], args.map( ( [ n, a ] ) => `<tr><td><code>${ esc( n ) }</code></td><td><span class="type">${ esc( a.type || '' ) }</span>${ a.required ? ' <span class="required">Required</span>' : '' }</td><td>${ inline( a.description || '' ) }${ a.default !== undefined ? ` Default <code>${ esc( JSON.stringify( a.default ) ) }</code>.` : '' }</td></tr>` ) );
		}
		if ( r.schema ) {
			body += `<h4>Response</h4>${ schemaTable( r.schema ) }`;
		}
		body += '</section>\n';
	}
	body += '</section>\n';

	body += `<section>${ hooks.h2( 'graphql', 'WPGraphQL' ) }<p>When WPGraphQL is active, Riff adds these fields and types.</p>`;
	// Said from the code, so the page stays true when either side changes.
	const missing = Object.keys( s.track.properties ).filter( ( p ) => ! ( s.gql_types.RiffTrack?.fields || {} )[ p ] );
	if ( missing.length ) {
		body += `<p><code>RiffTrack</code> does not yet carry every property of <a href="../php/#track-schema">the track schema</a>: ${ missing.map( ( p ) => `<code>${ esc( p ) }</code>` ).join( ', ' ) } are only in REST.</p>`;
	}
	const gqlType = ( t ) => ( typeof t === 'string' ? t : `[${ t.list_of }]` );
	body += table( [ 'Field', 'Description' ], s.gql_fields.map( ( f ) => `<tr><td><code>${ esc( f.type ) }.${ esc( f.name ) }</code><span class="type">${ esc( gqlType( f.returns ) ) }</span></td><td>${ inline( f.description ) }</td></tr>` ) );
	for ( const [ name, t ] of Object.entries( s.gql_types ) ) {
		body += `<h3 id="${ name.toLowerCase() }" class="is-toc-heading"><a href="#${ name.toLowerCase() }"><code>${ esc( name ) }</code></a></h3><p>${ inline( t.description || '' ) }</p>`;
		body += table( [ 'Field', 'Type' ], Object.entries( t.fields ).map( ( [ n, f ] ) => `<tr><td><code>${ esc( n ) }</code></td><td><span class="type">${ esc( gqlType( f.type ) ) }</span></td></tr>` ) );
	}
	body += '</section>\n';

	return referencePage( {
		title: 'REST API | RiffPress',
		description: 'Riff over HTTP: the track on every media item, the library routes, and the WPGraphQL fields.',
		url: 'developers/rest/',
		current: 'rest',
		trail: [ [ 'REST API' ] ],
		h1: '<h1>REST API</h1>',
		toc: [ [ 'media', 'The track on media' ], [ 'routes', 'Routes', toc ], [ 'graphql', 'WPGraphQL' ] ],
		body,
	} );
}

// ---- /developers/css/

function cssPage( data ) {
	const groups = [
		[ 'player', 'The player', '#riff', 'Set on the player\'s root, <code>#riff</code>, so they reach the bar and Now Playing and nothing else. <code>--riff-bar-h</code> is on <code>:root</code>, since the page keeps room for the bar.' ],
		[ 'listen-block', 'The Listen block', '.riff-app', 'Set on the block\'s root, <code>.riff-app</code>. The block\'s colour settings in the editor set its background and text colour directly, on top of these.' ],
	];
	let body = '<section class="summary"><p>The player and the Listen block take their colours and sizes from custom properties. The ones below are public: each keeps its name within a major version. Any other <code>--riff-*</code> property is internal and may change.</p><p>They are all in one stylesheet, <code>riff-tokens</code>. An extension lists it as a dependency of its own, <code>wp_register_style( \'my-extension\', $src, array( \'riff-tokens\' ) )</code>, and uses the names rather than copying values.</p></section>\n';
	for ( const [ id, title, selector, text ] of groups ) {
		const list = data.properties.filter( ( p ) => ( selector === '#riff' ? ! p.selector.includes( '.riff-app' ) : p.selector.includes( '.riff-app' ) ) );
		body += `<section>${ hooks.h2( id, title ) }<p>${ text }</p>`;
		body += table( [ 'Property', 'Description' ], list.map( ( p ) => `<tr><td><a href="${ REPO }${ rel( p.file ) }#L${ p.line }">${ esc( p.name ) }</a><code>${ esc( p.value ) }</code></td><td>${ inline( p.summary ) }${ p.description ? ' ' + inline( p.description ) : '' }</td></tr>` ) );
		body += '</section>\n';
	}
	body += `<section>${ hooks.h2( 'the-accent', 'The accent' ) }<p>A theme sets the player's accent in <code>theme.json</code>.</p>`;
	body += hooks.codeBlock( `{
	"settings": {
		"custom": {
			"riff": { "accent": "#e26f56" }
		}
	}
}` );
	body += '<p>A theme or plugin can set the others in its own stylesheet, with a selector one step more specific than the player\'s <code>#riff</code> so the order the stylesheets load in does not matter.</p>';
	body += hooks.codeBlock( `body #riff {
	--riff-bg: #101010;
	--riff-surface: #1c1c1c;
}` ) + '</section>\n';

	return referencePage( {
		title: 'CSS | RiffPress',
		description: 'The public custom properties of the Riff player and the Listen block, and how a theme sets the accent.',
		url: 'developers/css/',
		current: 'css',
		trail: [ [ 'CSS' ] ],
		h1: '<h1>CSS</h1>',
		toc: [ ...groups.map( ( [ id, title ] ) => [ id, title ] ), [ 'the-accent', 'The accent' ] ],
		body,
	} );
}

function site( data ) {
	return new Map( [
		[ path.join( SITE, 'php', 'index.html' ), phpPage( data ) ],
		[ path.join( SITE, 'rest', 'index.html' ), restPage( data ) ],
		[ path.join( SITE, 'css', 'index.html' ), cssPage( data ) ],
	] );
}

function main() {
	const data = collect();
	const found = problems( data );
	if ( ! process.argv.includes( '--check' ) ) {
		for ( const [ file, html ] of site( data ) ) {
			fs.mkdirSync( path.dirname( file ), { recursive: true } );
			fs.writeFileSync( file, html );
		}
		console.log( `Wrote site/developers/php/, rest/ and css/ (${ data.properties.length } custom properties, ${ data.surface.routes.length } routes)` );
	}
	if ( found.length ) {
		found.forEach( ( p ) => console.error( p ) );
		process.exit( 1 );
	}
	if ( process.argv.includes( '--check' ) ) {
		console.log( `The PHP, REST and CSS references are documented (${ data.sourceMethods.length } Source methods, ${ data.properties.length } custom properties, ${ data.surface.routes.length } routes)` );
	}
}

if ( require.main === module ) {
	main();
}

module.exports = { collect, problems, site, customProperties, functionsIn, schemaRows };
