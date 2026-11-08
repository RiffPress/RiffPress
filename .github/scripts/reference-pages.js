#!/usr/bin/env node
/**
 * The PHP, REST API and CSS references under /developers/, each read from the code:
 *
 * - PHP: the PHP hooks, the public functions in src/functions.php, the Riff\Source interface and
 *   Sources::register() from their docblocks, the track schema from Tracks::schema(), the Block Bindings source from Bindings::keys(), the
 *   abilities from Abilities::list(), and the Listen block from its block.json.
 * - REST API: the routes, their arguments and response schemas, the REST field on media, and the
 *   WPGraphQL types, from the plugin's own registration code run by surface.php.
 * - CSS: every custom property in tokens.css (the riff-tokens stylesheet) with a docblock, which
 *   is what makes it public.
 *
 * The pages quote line numbers, so they are built at deploy time from the commit being published.
 * --check fails when something public has no docblock or no @since, a function's @param lines
 * differ from what it takes, or the harness cannot run.
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

const FUNCTIONS = path.join( PLUGIN, 'src', 'functions.php' );

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
			block: block ? block.text : '',
			...hooks.parse( block ? block.text : null ),
		} );
	} );
	return out;
}

/**
 * The keys of a parameter documented as WordPress documents an array of arguments: the
 * `@param array $args {` line, a `@type` line for each key, and a closing `}`.
 *
 * @param {string} block Docblock text.
 * @param {string} name  The parameter, with its `$`.
 * @return {Array|null} [ { name, type, description } ], or null when it is not documented so.
 */
function hashOf( block, name ) {
	const lines = block.split( '\n' ).map( ( l ) => l.replace( /^\s*\/?\*+\/?\s?/, '' ).replace( /\s*\*\/$/, '' ).trim() );
	const opens = new RegExp( `^@param\\s+\\S+\\s+${ name.replace( '$', '\\$' ) }\\s*\\{$` );
	const at = lines.findIndex( ( l ) => opens.test( l ) );
	if ( at < 0 ) {
		return null;
	}
	const keys = [];
	keys.description = '';
	// One level deep: a key that is itself an array of arguments is listed with the words that
	// open it, and the keys inside it are left to its own documentation.
	let depth = 1;
	for ( const line of lines.slice( at + 1 ) ) {
		if ( line === '}' ) {
			depth--;
			if ( ! depth ) {
				break;
			}
			continue;
		}
		const m = /^@type\s+(\S+)\s+\$(\w+)\s*(.*?)\s*(\{)?$/.exec( line );
		if ( m && depth === 1 ) {
			keys.push( { type: m[ 1 ], name: m[ 2 ], description: m[ 3 ] } );
			depth += m[ 4 ] ? 1 : 0;
		} else if ( m && m[ 4 ] ) {
			depth++;
		} else if ( line && ( depth === 1 || ( depth === 2 && ! /^@/.test( line ) && keys.length && ! keys[ keys.length - 1 ].nested ) ) ) {
			if ( depth === 2 ) {
				keys[ keys.length - 1 ].description = ( keys[ keys.length - 1 ].description + ' ' + line ).trim();
			} else if ( keys.length ) {
				keys[ keys.length - 1 ].description += ' ' + line;
			} else {
				keys.description = ( keys.description + ' ' + line ).trim();
			}
		} else if ( depth === 2 && /^@/.test( line ) && keys.length ) {
			// Past its opening words, into its own keys.
			keys[ keys.length - 1 ].nested = true;
		}
	}
	keys.forEach( ( k ) => delete k.nested );
	return keys;
}

/**
 * The name of every function a file declares, however its signature is laid out, so one the
 * reference cannot read is still counted.
 *
 * @param {string} file Absolute path.
 * @return {string[]} Names.
 */
const declared = ( file ) => [ ...fs.readFileSync( file, 'utf8' ).matchAll( /^\s*function\s+&?(\w+)\s*\(/gm ) ].map( ( m ) => m[ 1 ] );

/**
 * Riff's functions for other plugins: every function in src/functions.php. An array of arguments
 * that a function documents with `@see Riff\Class::method()` is listed with that method's keys.
 *
 * @param {string} file Absolute path.
 * @return {Array} Declarations, each parameter with its `keys`.
 */
function publicFunctions( file = FUNCTIONS ) {
	return functionsIn( file ).map( ( f ) => {
		const see = /@see\s+Riff\\(\w+)::(\w+)\(\)/.exec( f.block );
		const kebab = see ? see[ 1 ].replace( /([a-z0-9])([A-Z])/g, '$1-$2' ).toLowerCase() : '';
		const target = see && fs.existsSync( path.join( PLUGIN, 'src', `class-${ kebab }.php` ) ) ? functionsIn( path.join( PLUGIN, 'src', `class-${ kebab }.php` ), see[ 2 ] )[ 0 ] : null;
		return {
			...f,
			see: see ? { name: `Riff\\${ see[ 1 ] }::${ see[ 2 ] }()`, found: !! target } : null,
			params: f.params.map( ( p ) => {
				const own = hashOf( f.block, p.name );
				// Documented here, the parameter's words are the hash's own, not its lines run together.
				return own ? { ...p, description: own.description, keys: own } : { ...p, keys: ( target && hashOf( target.block, p.name ) ) || [] };
			} ),
		};
	} );
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
		functions: publicFunctions(),
		declared: declared( FUNCTIONS ),
		sourceDoc: interfaceDoc( iface ),
		sourceMethods: functionsIn( iface ),
		register: functionsIn( path.join( PLUGIN, 'src', 'class-sources.php' ), 'register' )[ 0 ],
		unregister: functionsIn( path.join( PLUGIN, 'src', 'class-sources.php' ), 'unregister' )[ 0 ],
		shortcode: functionsIn( path.join( PLUGIN, 'features', 'listen', 'class-app.php' ), 'shortcode' )[ 0 ],
		bindingValue: functionsIn( path.join( PLUGIN, 'src', 'class-bindings.php' ), 'value' )[ 0 ],
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
	if ( ! data.functions.length ) {
		out.push( 'src/functions.php has no functions' );
	}
	for ( const name of ( data.declared || [] ).filter( ( n ) => ! data.functions.some( ( f ) => f.name === n ) ) ) {
		out.push( `${ name }() in src/functions.php is not read; keep its signature on one line` );
	}
	for ( const f of data.functions ) {
		need( `${ f.name }()`, f );
		if ( ! f.documented ) {
			continue;
		}
		if ( f.params.length !== f.arity ) {
			out.push( `${ f.name }() takes ${ f.arity } parameter${ f.arity === 1 ? '' : 's' } but documents ${ f.params.length } @param` );
		}
		if ( f.see && ! f.see.found ) {
			out.push( `${ f.name }() points to ${ f.see.name }, which is not in src/` );
		}
		for ( const p of f.params ) {
			if ( p.type === 'array' && ! p.keys.length ) {
				out.push( `${ f.name }() takes ${ p.name } but documents none of its keys, as @type lines here or in the method its @see names` );
			}
			for ( const k of p.keys.filter( ( key ) => ! key.description ) ) {
				out.push( `${ f.name }() documents ${ p.name }['${ k.name }'] with no description` );
			}
		}
	}
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
	need( 'The Block Bindings source, Bindings::value()', data.bindingValue );
	if ( ! data.surface.bindings?.length ) {
		out.push( 'no Block Bindings source is registered' );
	}
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
 * @return {Array} [ name, type, description, values ] rows: values are an enum's, or empty.
 */
function schemaRows( schema, prefix = '' ) {
	const rows = [];
	for ( const [ name, prop ] of Object.entries( schema.properties || {} ) ) {
		const full = prefix + name;
		const type = [].concat( prop.type || '' ).join( ' | ' );
		rows.push( [ full, type, prop.description || '', prop.enum || [] ] );
		if ( prop.properties ) {
			rows.push( ...schemaRows( prop, `${ full }.` ) );
		}
		if ( prop.items?.properties ) {
			rows.push( ...schemaRows( prop.items, `${ full }[].` ) );
		}
	}
	return rows;
}

// A nested property's name: the path to it quiet, the property itself plain, and a place to break
// after each step, so a long path wraps between its parts and not inside a word.
const propertyName = ( name ) => {
	const at = name.lastIndexOf( '.' ) + 1;
	const steps = ( part ) => esc( part ).replace( /\./g, '.<wbr>' );
	return at ? `<span class="path">${ steps( name.slice( 0, at ) ) }</span>${ esc( name.slice( at ) ) }` : esc( name );
};
// An enum's values go with the description, where there is room for them, and not in the type.
const values = ( list ) => ( list.length ? ` One of ${ list.map( ( v ) => `<code>${ esc( v ) }</code>` ).join( ', ' ) }.` : '' );
const schemaTable = ( schema ) => table( [ 'Property', 'Type', 'Description' ], schemaRows( schema ).map( ( [ n, t, d, v ] ) => `<tr><td><code>${ propertyName( n ) }</code></td><td><span class="type">${ esc( t ) }</span></td><td>${ inline( d ) }${ values( v ) }</td></tr>` ) );

function member( m, title ) {
	let html = `<section class="member" id="${ esc( m.name.toLowerCase() ) }"><h3 class="code-title member-title"><a href="#${ esc( m.name.toLowerCase() ) }">${ esc( title || m.signature ) }</a></h3><p>${ inline( m.summary ) }</p>`;
	if ( m.description ) {
		html += m.description.split( '\n\n' ).map( ( p ) => `<p>${ inline( p ) }</p>` ).join( '' );
	}
	if ( m.params.length ) {
		const keys = ( p ) => ( p.keys?.length ? '<ul class="param-hash">' + p.keys.map( ( k ) => `<li><code>${ esc( k.name ) }</code><span class="type">${ esc( k.type ) }</span><div class="desc">${ inline( k.description ) }</div></li>` ).join( '' ) + '</ul>' : '' );
		html += '<div class="parameters"><h4>Parameters</h4><dl>' + m.params.map( ( p ) => `<dt><code>${ esc( p.name ) }</code><span class="type">${ esc( p.type ) }</span></dt><dd><div class="desc">${ inline( p.description ) }</div>${ keys( p ) }</dd>` ).join( '' ) + '</dl></div>';
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

	body += `<section>${ hooks.h2( 'functions', 'Functions' ) }<p>The bar's controls and Now Playing's views are registered on the server, as WordPress registers blocks, so the page has every button and every view before any script runs. Register them on the <a href="../hooks/riff_register/"><code>riff_register</code></a> action; Riff registers its own there too, and any of them can be taken away. In the browser, <a href="../javascript/#method-view"><code>window.riff.view()</code></a> and <a href="../javascript/#method-control"><code>window.riff.control()</code></a> give each what it does, by its id. <a href="../player/#registering-controls-and-views">How the player works</a> has the whole of it.</p>`;
	body += hooks.codeBlock( `add_action( 'riff_register', function () {
	riff_register_view( 'credits', array(
		'label' => __( 'Credits', 'my-plugin' ),
		'icon'  => '<svg viewBox="0 0 24 24">…</svg>',
		'order' => 32,
	) );
} );` ) + '</section>\n';
	for ( const f of data.functions ) {
		body += member( f, f.signature.replace( /^function\s+/, '' ) );
	}

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


	const supports = Object.entries( data.block.supports || {} ).filter( ( [ , v ] ) => v ).map( ( [ k ] ) => k );
	for ( const b of data.surface.bindings || [] ) {
		body += `<section>${ hooks.h2( 'block-bindings', 'Block Bindings' ) }<p><code>${ esc( b.name ) }</code> (“${ esc( b.label ) }”) is a <a href="https://developer.wordpress.org/block-editor/reference-guides/block-api/block-bindings/">Block Bindings</a> source: a Heading or Paragraph bound to it shows a track's details, and an Image bound to it shows the cover, with no Riff block on the page. The binding's <code>key</code> picks the detail and <code>id</code> names the attachment; with no <code>id</code>, it is the post's first track. Every value is the track as <a href="../track/">the track schema</a> has it, after <a href="../hooks/riff_track/"><code>riff_track</code></a>, and a named track shows only where the media route would show it. In the editor the block shows that it is bound; the value is filled on the front end.</p>${ hooks.codeBlock( '<!-- wp:heading {"metadata":{"bindings":{"content":{"source":"riff/track","args":{"key":"title","id":123}}}}} -->\n<h2 class="wp-block-heading"></h2>\n<!-- /wp:heading -->\n\n<!-- wp:image {"metadata":{"bindings":{"url":{"source":"riff/track","args":{"key":"cover","id":123}}}}} -->\n<figure class="wp-block-image"><img src="" alt=""/></figure>\n<!-- /wp:image -->' ) }${ table( [ 'Key', 'Shows' ], Object.entries( b.keys ).map( ( [ k, d ] ) => `<tr><td><code>${ esc( k ) }</code></td><td>${ inline( d ) }</td></tr>` ) ) }</section>\n`;
	}
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
		title: 'PHP',
		description: 'Riff\'s PHP surface: every hook, the functions that register the player\'s controls and views, the Source interface for your own tracks, the Block Bindings source, the abilities and the Listen block.',
		url: 'developers/php/',
		h1: '<h1>PHP</h1>',
		toc: [
			[ 'hooks', 'Hooks', [ [ 'filters', 'Filters' ], [ 'actions', 'Actions' ] ] ],
			[ 'functions', 'Functions', data.functions.map( ( f ) => [ f.name.toLowerCase(), `${ f.name }()` ] ) ],
			[ 'sources', 'Sources', [ [ 'the-source-interface', 'The Source interface' ] ] ],
			[ 'block-bindings', 'Block Bindings' ],
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
		body += `<p>Every audio and video item in <code>wp/v2/media</code> carries <code>${ esc( f.name ) }</code>: ${ inline( f.schema?.description || '' ) } It is read only, and <code>null</code> for any other file. Its shape is <a href="../track/">the track schema</a>.</p>`;
	}
	body += hooks.codeBlock( 'GET /wp-json/wp/v2/media/123?_fields=id,riff_track' ) + '</section>\n';

	body += `<section>${ hooks.h2( 'routes', 'Routes' ) }`;
	const toc = [];
	for ( const r of s.routes ) {
		const shown = `/${ r.namespace }${ r.route.replace( /\(\?P<(\w+)>[^)]+\)/g, '{$1}' ) }`;
		const id = shown.replace( /[^a-z0-9]+/gi, '-' ).replace( /^-|-$/g, '' ).toLowerCase();
		// In the contents without the namespace every route shares, so the longest still fit.
		toc.push( [ id, shown.replace( `/${ r.namespace }`, '' ) ] );
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
		body += `<p><code>RiffTrack</code> does not yet carry every property of <a href="../track/">the track schema</a>: ${ missing.map( ( p ) => `<code>${ esc( p ) }</code>` ).join( ', ' ) } are only in REST.</p>`;
	}
	const gqlType = ( t ) => ( typeof t === 'string' ? t : `[${ t.list_of }]` );
	body += table( [ 'Field', 'Description' ], s.gql_fields.map( ( f ) => `<tr><td><code>${ esc( f.type ) }.${ esc( f.name ) }</code><span class="type">${ esc( gqlType( f.returns ) ) }</span></td><td>${ inline( f.description ) }</td></tr>` ) );
	for ( const [ name, t ] of Object.entries( s.gql_types ) ) {
		body += `<h3 id="${ name.toLowerCase() }" class="is-toc-heading"><a href="#${ name.toLowerCase() }"><code>${ esc( name ) }</code></a></h3><p>${ inline( t.description || '' ) }</p>`;
		body += table( [ 'Field', 'Type' ], Object.entries( t.fields ).map( ( [ n, f ] ) => `<tr><td><code>${ esc( n ) }</code></td><td><span class="type">${ esc( gqlType( f.type ) ) }</span></td></tr>` ) );
	}
	body += '</section>\n';

	return referencePage( {
		title: 'REST API',
		description: 'Riff over HTTP: the track on every media item, the library routes, and the WPGraphQL fields.',
		url: 'developers/rest/',
		h1: '<h1>REST API</h1>',
		toc: [ [ 'media', 'The track on media' ], [ 'routes', [ ...new Set( s.routes.map( ( r ) => r.namespace ) ) ].length === 1 ? `Routes in /${ s.routes[ 0 ].namespace }` : 'Routes', toc ], [ 'graphql', 'WPGraphQL' ] ],
		body,
	} );
}

// ---- /developers/css/

function cssPage( data ) {
	const groups = [
		[ 'player', 'The player', '#riff', 'Set on the player\'s root, <code>#riff</code>, so they reach the bar and Now Playing and nothing else. <code>--riff-bar-h</code> is on <code>:root</code>, since the page keeps room for the bar.' ],
		[ 'listen-block', 'The Listen block', '.riff-app', 'Set on the block\'s root, <code>.riff-app</code>. The block\'s colour settings in the editor set its background and text colour directly, on top of these.' ],
		[ 'listen-app', 'The Listen app', '.riff-standalone', 'Set on the Listen app\'s own document, <code>body.riff-standalone</code>, at the Listen page\'s <code>app/</code> address or the site\'s. The Listen block in it takes its background and text from them.' ],
	];
	const group = ( p ) => {
		if ( p.selector.includes( '.riff-standalone' ) ) {
			return '.riff-standalone';
		}
		return p.selector.includes( '.riff-app' ) ? '.riff-app' : '#riff';
	};
	let body = '<section class="summary"><p>The player and the Listen block take their colours and sizes from custom properties. The ones below are public: each keeps its name within a major version. Any other <code>--riff-*</code> property is internal and may change.</p><p>They are all in one stylesheet, <code>riff-tokens</code>. An extension lists it as a dependency of its own, <code>wp_register_style( \'my-extension\', $src, array( \'riff-tokens\' ) )</code>, and uses the names rather than copying values.</p></section>\n';
	for ( const [ id, title, selector, text ] of groups ) {
		const list = data.properties.filter( ( p ) => group( p ) === selector );
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
		title: 'CSS',
		description: 'The public custom properties of the Riff player and the Listen block, and how a theme sets the accent.',
		url: 'developers/css/',
		h1: '<h1>CSS</h1>',
		toc: [ ...groups.map( ( [ id, title ] ) => [ id, title ] ), [ 'the-accent', 'The accent' ] ],
		body,
	} );
}

// ---- /developers/track/

function trackPage( data ) {
	const gqlComplete = Object.keys( data.surface.track.properties ).every( ( p ) => ( data.surface.gql_types.RiffTrack?.fields || {} )[ p ] );
	const body = `<section class="summary"><p>One shape for a track: the REST field and routes, the block markup and the player script all use it, and WPGraphQL carries <a href="../rest/#graphql">${ gqlComplete ? 'all of it' : 'most of it' }</a>.</p></section>\n<section>${ hooks.h2( 'properties', 'Properties' ) }<p>It is <code>Riff\\Tracks::schema()</code>, version <code>${ data.surface.version }</code>, and a track still matches it after the <a href="../hooks/riff_track/"><code>riff_track</code></a> filter.</p>${ schemaTable( data.surface.track ) }</section>\n`;
	return referencePage( {
		title: 'Track schema',
		description: 'The one shape of a track in Riff, shared by the REST field and routes, the block markup, the player script and WPGraphQL.',
		url: 'developers/track/',
		h1: '<h1>Track schema</h1>',
		toc: [ [ 'properties', 'Properties' ] ],
		body,
	} );
}

function site( data ) {
	return new Map( [
		[ path.join( SITE, 'php', 'index.html' ), phpPage( data ) ],
		[ path.join( SITE, 'track', 'index.html' ), trackPage( data ) ],
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
		console.log( `Wrote site/developers/php/, track/, rest/ and css/ (${ data.properties.length } custom properties, ${ data.surface.routes.length } routes)` );
	}
	if ( found.length ) {
		found.forEach( ( p ) => console.error( p ) );
		process.exit( 1 );
	}
	if ( process.argv.includes( '--check' ) ) {
		console.log( `The PHP, REST and CSS references are documented (${ data.functions.length } functions, ${ data.sourceMethods.length } Source methods, ${ data.properties.length } custom properties, ${ data.surface.routes.length } routes)` );
	}
}

if ( require.main === module ) {
	main();
}

module.exports = { collect, problems, site, customProperties, functionsIn, publicFunctions, declared, hashOf, schemaRows };
