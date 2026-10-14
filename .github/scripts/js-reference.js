#!/usr/bin/env node
/**
 * The JavaScript reference, from the player's own docblocks: every member of window.riff, with its
 * signature, parameters, what it returns and where it is defined, and the riff.* actions and
 * filters from the hooks reference.
 *
 * It writes docs/javascript.md, which is committed and checked, and site/developers/javascript/,
 * which quotes line numbers and so is built at deploy time from the commit being published, like
 * the hook pages.
 *
 * --check fails when docs/javascript.md is stale, or when a member has no docblock, no summary, no
 * @since, a method's @param lines do not match its parameters, or a property has no @type.
 *
 * Usage: node .github/scripts/js-reference.js [--check]
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { esc, inline, referencePage } = require( './site-shell.js' );
const hooks = require( './hooks-reference.js' );

const ROOT = path.resolve( __dirname, '..', '..' );
const PLAYER = path.join( ROOT, 'plugins', 'riff', 'assets', 'riff.js' );
const OUT = path.join( ROOT, 'docs', 'javascript.md' );
const SITE = path.join( ROOT, 'site', 'developers', 'javascript', 'index.html' );
// The deploy fills {{commit}} with the SHA it publishes, so every link opens the code as deployed.
const REPO = 'https://github.com/RiffPress/RiffPress/blob/{{commit}}/';

/**
 * Every member of the object the player assigns to window.riff, in the order it defines them.
 *
 * @param {string} file The player's source.
 * @return {Array} Members.
 */
function members( file = PLAYER ) {
	const src = fs.readFileSync( file, 'utf8' );
	const lines = src.split( '\n' );
	const start = lines.findIndex( ( l ) => /^\s*const api = \{\s*$/.test( l ) );
	if ( start < 0 ) {
		throw new Error( `No "const api = {" in ${ file }` );
	}
	const indent = lines[ start ].match( /^\s*/ )[ 0 ];
	const out = [];
	for ( let i = start + 1; i < lines.length; i++ ) {
		if ( lines[ i ].startsWith( `${ indent }};` ) ) {
			break;
		}
		const m = new RegExp( `^${ indent }\\t(\\w+)(\\(|:\\s*)(.*)$` ).exec( lines[ i ] );
		if ( ! m ) {
			continue;
		}
		const offset = lines.slice( 0, i ).join( '\n' ).length + 1 + lines[ i ].indexOf( m[ 1 ] ) + m[ 1 ].length;
		let kind = 'property';
		let arity = 0;
		if ( m[ 2 ] === '(' ) {
			kind = 'method';
			arity = hooks.callArgs( src, offset ).args.length;
		} else if ( /^(\([^)]*\)|\w+)\s*=>/.test( m[ 3 ] ) ) {
			kind = 'method';
			const open = src.indexOf( '(', offset );
			arity = m[ 3 ].startsWith( '(' ) ? hooks.callArgs( src, open ).args.length : 1;
		}
		const block = hooks.docblockAbove( lines, i );
		out.push( {
			name: m[ 1 ],
			kind,
			arity,
			file: path.relative( ROOT, file ),
			line: i + 1,
			...hooks.parse( block ? block.text : null ),
		} );
	}
	return out;
}

/**
 * Members the reference cannot describe truthfully.
 *
 * @param {Array} list From members().
 * @return {string[]} Problems.
 */
function problems( list ) {
	const out = [];
	for ( const m of list ) {
		const at = `window.riff.${ m.name } (${ m.file }:${ m.line })`;
		if ( ! m.documented ) {
			out.push( `${ at } has no docblock; add one above it` );
			continue;
		}
		if ( ! m.since ) {
			out.push( `${ at } has no @since` );
		}
		if ( ! m.summary ) {
			out.push( `${ at } has no summary line` );
		}
		const top = m.params.filter( ( p ) => ! p.property );
		if ( m.kind === 'method' && top.length !== m.arity ) {
			out.push( `${ at } takes ${ m.arity } parameter${ m.arity === 1 ? '' : 's' } but documents ${ top.length } @param` );
		}
		if ( m.kind === 'property' && ! m.typeTag ) {
			out.push( `${ at } is a property without a @type` );
		}
	}
	return out;
}

/** The member as it is called: play( tracks, [index], [options] ). */
function call( m ) {
	if ( m.kind === 'property' ) {
		return `window.riff.${ m.name }`;
	}
	const args = m.params.filter( ( p ) => ! p.property ).map( ( p ) => ( p.default !== undefined ? `${ p.name } = ${ p.default }` : p.name ) );
	return `window.riff.${ m.name }(${ args.length ? ` ${ args.join( ', ' ) } ` : '' })`;
}

const anchor = ( m ) => `${ m.kind }-${ m.name.toLowerCase() }`;

// The parts of the reference that are guidance rather than read from the code. Each is a heading,
// paragraphs, and code, rendered into both the Markdown and the page.
const GUIDE = [
	{
		id: 'a-track',
		title: 'A track',
		text: [ 'Every track the player takes or hands back is the shape `Tracks::schema()` describes in PHP; the PHP reference lists every property. The REST API returns the same shape.' ],
	},
	{
		id: 'controls',
		title: 'Controls',
		text: [ 'Add a chip under Now Playing or a control at the end of the bar from PHP, with the `riff_chips` or `riff_bar_controls` filter, then handle the press with the `riff.action` action.' ],
		code: [
			[ 'php', `add_filter( 'riff_chips', function ( array $chips ): array {
	$chips['lyrics'] = array(
		'label'  => __( 'Lyrics', 'my-plugin' ),
		'action' => 'my-plugin-lyrics',
		'svg'    => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="…"/></svg>',
	);
	return $chips;
} );` ],
			[ 'js', `wp.hooks.addAction( 'riff.action', 'my-plugin', ( { action, track } ) => {
	if ( action === 'my-plugin-lyrics' ) {
		showLyrics( track );
	}
} );` ],
		],
	},
	{
		id: 'loading-your-script',
		title: 'Loading your script',
		text: [ 'The player is an ES module with no dependencies. A script that uses `wp.hooks` depends on `wp-hooks`; one that only uses `window.riff` or the events can load however it likes, and should wait for `riff.ready` (or check `window.riff`) before calling anything.' ],
	},
];

const INTRO = 'How a script talks to the player. `window.riff` is set before the `riff.ready` action fires. Everything here is public and keeps working within a major version.';
const EVENTS = 'Each change of state is announced twice with the same detail: through `wp.hooks` as `riff.<name>`, for scripts that depend on `wp-hooks`, and as a `riff:<name>` `CustomEvent` on `#riff` that bubbles, for everything else. The filters run only through `wp.hooks`.';

// ---- docs/javascript.md

function render( list, jsHooks ) {
	let md = '# JavaScript\n\n';
	md += 'Generated from the docblocks in `plugins/riff/assets/riff.js` by `npm run docs:js`. Do not edit by hand. ';
	md += 'The same reference is on the site under Developers, JavaScript.\n\n';
	md += `${ INTRO }\n\n## \`window.riff\`\n\n`;
	for ( const m of list ) {
		md += `### \`${ call( m ) }\`\n\n${ m.summary }\n\n`;
		if ( m.description ) {
			md += `${ m.description }\n\n`;
		}
		if ( m.typeTag ) {
			md += `Type: \`${ m.typeTag }\`.\n\n`;
		}
		if ( m.params.length ) {
			md += '| Parameter | Type | Description |\n| --- | --- | --- |\n';
			for ( const p of m.params ) {
				md += `| \`${ p.name }\` | \`${ hooks.cell( p.type ) }\` | ${ hooks.cell( p.description ) } |\n`;
			}
			md += '\n';
		}
		if ( m.returns ) {
			md += `Returns \`${ m.returns.type }\`: ${ m.returns.description }\n\n`;
		}
		md += `Since ${ m.since }.\n\n`;
	}
	md += `## Actions and filters\n\n${ EVENTS }\n\n`;
	for ( const h of jsHooks ) {
		md += `- [\`${ h.name }\`](hooks.md#${ h.name.replace( /\./g, '' ) }), ${ h.type }: ${ h.summary }\n`;
	}
	md += '\n';
	for ( const g of GUIDE ) {
		md += `## ${ g.title }\n\n${ g.text.join( '\n\n' ) }\n\n`;
		for ( const [ lang, code ] of g.code || [] ) {
			md += `\`\`\`${ lang }\n${ code }\n\`\`\`\n\n`;
		}
	}
	return md.replace( /\n+$/, '\n' );
}

// ---- site/developers/javascript/

function page( list, jsHooks ) {
	const toc = [
		[ 'window-riff', 'window.riff', [ [ 'properties', 'Properties' ], [ 'methods', 'Methods' ] ] ],
		[ 'actions-and-filters', 'Actions and filters' ],
		...GUIDE.map( ( g ) => [ g.id, g.title ] ),
	];
	const table = ( rows ) => `<table class="code-table"><thead><tr><th scope="col">Name</th><th scope="col">Description</th></tr></thead><tbody>${ rows.join( '' ) }</tbody></table>`;

	let body = `<section class="summary"><p>${ inline( INTRO ) }</p></section>\n`;
	body += `<section>${ hooks.h2( 'window-riff', '<code>window.riff</code>' ) }`;
	for ( const kind of [ 'property', 'method' ] ) {
		const ofKind = list.filter( ( m ) => m.kind === kind );
		const id = kind === 'property' ? 'properties' : 'methods';
		body += `<h3 id="${ id }" class="is-toc-heading"><a href="#${ id }">${ kind === 'property' ? 'Properties' : 'Methods' }</a></h3>`;
		body += table( ofKind.map( ( m ) => `<tr><td><a href="#${ anchor( m ) }">${ esc( m.name ) }${ kind === 'method' ? '()' : '' }</a></td><td>${ inline( m.summary ) }</td></tr>` ) );
	}
	body += '</section>\n';

	for ( const m of list ) {
		body += `<section class="member" id="${ anchor( m ) }"><h3 class="code-title member-title"><a href="#${ anchor( m ) }">${ esc( call( m ) ) }</a></h3><p>${ inline( m.summary ) }</p>`;
		if ( m.description ) {
			body += m.description.split( '\n\n' ).map( ( p ) => `<p>${ inline( p ) }</p>` ).join( '' );
		}
		if ( m.typeTag ) {
			body += `<p class="returns">Type: <span class="type">${ esc( m.typeTag ) }</span></p>`;
		}
		const top = m.params.filter( ( p ) => ! p.property );
		if ( top.length ) {
			body += '<div class="parameters"><h4>Parameters</h4><dl>';
			for ( const p of top ) {
				const props = m.params.filter( ( q ) => q.property && q.name.startsWith( p.name + '.' ) );
				body += `<dt><code>${ esc( p.name ) }</code><span class="type">${ esc( p.type ) }</span>${ p.optional ? '<span class="required">Optional</span>' : '<span class="required">Required</span>' }</dt><dd><div class="desc">${ inline( p.description ) }${ p.default !== undefined ? ` Default <code>${ esc( p.default ) }</code>.` : '' }</div>`;
				if ( props.length ) {
					body += '<ul class="param-hash">' + props.map( ( q ) => `<li><code>${ esc( q.name.slice( p.name.length + 1 ) ) }</code><span class="type">${ esc( q.type ) }</span><div class="desc">${ inline( q.description ) }</div></li>` ).join( '' ) + '</ul>';
				}
				body += '</dd>';
			}
			body += '</dl></div>';
		}
		if ( m.returns ) {
			body += `<div class="parameters"><h4>Return</h4><p><span class="type">${ esc( m.returns.type ) }</span> ${ inline( m.returns.description ) }</p></div>`;
		}
		body += `<p class="dot-links"><span>Since ${ esc( m.since ) }</span><span class="file"><code>${ esc( m.file ) }</code></span><a href="${ REPO }${ m.file }#L${ m.line }">View on GitHub</a></p></section>\n`;
	}

	body += `<section>${ hooks.h2( 'actions-and-filters', 'Actions and filters' ) }<p>${ inline( EVENTS ) }</p>`;
	body += table( jsHooks.map( ( h ) => `<tr><td><a href="../hooks/${ h.slug }/">${ esc( h.name ) }</a><code>${ h.type }</code></td><td>${ inline( h.summary ) }</td></tr>` ) );
	body += `${ hooks.codeBlock( `wp.hooks.addAction( 'riff.track', 'my-plugin', ( detail, riff ) => {\n\tconsole.log( detail.track.title );\n} );\n\nwindow.riff.on( 'play', ( detail ) => {} );\ndocument.getElementById( 'riff' ).addEventListener( 'riff:pause', ( e ) => e.detail );` ) }</section>\n`;

	for ( const g of GUIDE ) {
		body += `<section>${ hooks.h2( g.id, esc( g.title ) ) }${ g.text.map( ( t ) => `<p>${ inline( t ) }</p>` ).join( '' ) }${ ( g.code || [] ).map( ( [ , code ] ) => hooks.codeBlock( code ) ).join( '' ) }</section>\n`;
	}

	return referencePage( {
		title: 'JavaScript, RiffPress',
		description: 'window.riff and the player\'s actions and filters: how a script talks to the Riff player.',
		url: 'developers/javascript/',
		current: 'javascript',
		trail: [ [ 'JavaScript' ] ],
		h1: '<h1>JavaScript</h1>',
		toc,
		body,
	} );
}

function jsHookPages() {
	return hooks.pages( hooks.collect().filter( ( h ) => h.lang === 'js' ) );
}

function main() {
	const list = members();
	const jsHooks = jsHookPages();
	const markdown = render( list, jsHooks );
	const found = problems( list );
	if ( process.argv.includes( '--check' ) ) {
		const current = fs.existsSync( OUT ) ? fs.readFileSync( OUT, 'utf8' ) : '';
		if ( current !== markdown ) {
			found.unshift( 'docs/javascript.md is out of date: run npm run docs:js' );
		}
		if ( found.length ) {
			found.forEach( ( p ) => console.error( p ) );
			process.exit( 1 );
		}
		console.log( `docs/javascript.md is current (${ list.length } members)` );
		return;
	}
	fs.writeFileSync( OUT, markdown );
	fs.mkdirSync( path.dirname( SITE ), { recursive: true } );
	fs.writeFileSync( SITE, page( list, jsHooks ) );
	console.log( `Wrote docs/javascript.md and site/developers/javascript/ (${ list.length } members)` );
	if ( found.length ) {
		found.forEach( ( p ) => console.error( p ) );
		process.exit( 1 );
	}
}

if ( require.main === module ) {
	main();
}

module.exports = { members, problems, render, page, call };
