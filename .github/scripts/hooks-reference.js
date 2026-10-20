#!/usr/bin/env node
/**
 * The hooks reference, from the plugin's own docblocks: every apply_filters() and do_action() in the
 * PHP, and every riff.* action and filter the player fires in JavaScript, with its summary, @since,
 * parameters, and where it fires.
 *
 * It writes docs/hooks.md, which is committed and checked, and site/developers/hooks/, one page per
 * hook laid out like developer.wordpress.org's code reference. The pages quote the line a hook fires
 * on, so they are built at deploy time from the commit being published and are not committed.
 *
 * --check fails when docs/hooks.md is stale, or when a hook has no docblock, no @since, or a
 * different number of @param lines than the arguments it passes.
 *
 * Usage: node .github/scripts/hooks-reference.js [--check]
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { esc, inline, head, FOOT, localNav, crumbs } = require( './site-shell.js' );

const ROOT = path.resolve( __dirname, '..', '..' );
const PLUGIN = path.join( ROOT, 'plugins', 'riff' );
const OUT = path.join( ROOT, 'docs', 'hooks.md' );
const SITE = path.join( ROOT, 'site', 'developers', 'hooks' );
// The JavaScript hooks fire through emit() and filter() in the player, which prefix the name.
const PLAYER = path.join( PLUGIN, 'assets', 'riff.js' );
// The deploy fills {{commit}} with the SHA it publishes, so every link opens the code as deployed.
const REPO = 'https://github.com/RiffPress/RiffPress/blob/{{commit}}/';

function files( dir, ext ) {
	const out = [];
	for ( const entry of fs.readdirSync( dir, { withFileTypes: true } ) ) {
		if ( [ 'tests', 'node_modules', 'vendor', 'build' ].includes( entry.name ) ) {
			continue;
		}
		const full = path.join( dir, entry.name );
		if ( entry.isDirectory() ) {
			out.push( ...files( full, ext ) );
		} else if ( entry.name.endsWith( ext ) ) {
			out.push( full );
		}
	}
	return out.sort();
}

/**
 * The arguments of the call whose opening parenthesis is at `open`, split at top-level commas,
 * and the offset just past its closing parenthesis.
 *
 * @param {string} src  Source.
 * @param {number} open Offset of the opening parenthesis.
 * @return {{args: string[], end: number}} Arguments, trimmed.
 */
function callArgs( src, open ) {
	const args = [];
	let depth = 0;
	let quote = null;
	let start = open + 1;
	for ( let i = open; i < src.length; i++ ) {
		const c = src[ i ];
		if ( quote ) {
			if ( c === '\\' ) {
				i++;
			} else if ( c === quote ) {
				quote = null;
			}
			continue;
		}
		if ( c === '"' || c === "'" || c === '`' ) {
			quote = c;
		} else if ( '([{'.includes( c ) ) {
			depth++;
		} else if ( ')]}'.includes( c ) ) {
			depth--;
			if ( depth === 0 ) {
				args.push( src.slice( start, i ).trim() );
				return { args: args.filter( Boolean ), end: i + 1 };
			}
		} else if ( c === ',' && depth === 1 ) {
			args.push( src.slice( start, i ).trim() );
			start = i + 1;
		}
	}
	throw new Error( 'Unbalanced call' );
}

/**
 * The docblock that ends on the line above `line`, or within the few lines above it when the hook
 * fires in the middle of a statement.
 *
 * It does not reach past the end of another statement, so a hook without a docblock cannot borrow
 * the one above the statement before it.
 *
 * @param {string[]} lines Source lines.
 * @param {number}   line  Zero-based line the hook fires on.
 * @return {{text: string, start: number}|null} Docblock text and the line it starts on.
 */
function docblockAbove( lines, line ) {
	let j = line;
	while ( j > 0 && j > line - 6 && ! /\*\/\s*$/.test( lines[ j - 1 ] ) && ! /[;{}]\s*$/.test( lines[ j - 1 ] ) ) {
		j--;
	}
	if ( j === 0 || ! /\*\/\s*$/.test( lines[ j - 1 ] ) ) {
		return null;
	}
	let k = j - 1;
	while ( k >= 0 && ! /\/\*\*/.test( lines[ k ] ) ) {
		k--;
	}
	return { text: lines.slice( k, j ).join( '\n' ), start: k };
}

/**
 * The method or function a PHP hook fires in, as Class::method() or function(), with the summary
 * line of its own docblock.
 *
 * @param {string[]} lines Source lines.
 * @param {number}   line  Zero-based line.
 * @return {{name: string, summary: string}|null} The caller, or null outside one.
 */
function enclosing( lines, line ) {
	let fn = null;
	for ( let i = line; i >= 0; i-- ) {
		const f = /^\s*(?:(?:public|private|protected|static|final|abstract)\s+)*function\s+&?(\w+)\s*\(/.exec( lines[ i ] );
		if ( f && ! fn ) {
			const block = docblockAbove( lines, i );
			fn = { name: f[ 1 ], summary: parse( block ? block.text : null ).summary };
		}
		const c = /^\s*(?:(?:final|abstract|readonly)\s+)*(?:class|trait)\s+(\w+)/.exec( lines[ i ] );
		if ( c ) {
			return fn ? { ...fn, name: `${ c[ 1 ] }::${ fn.name }()` } : null;
		}
	}
	return fn ? { ...fn, name: `${ fn.name }()` } : null;
}

/**
 * Finds hooks in one file.
 *
 * In PHP: apply_filters(), do_action() and their _deprecated forms with a literal name. In the
 * player's JavaScript: filter( 'name', … ) and emit( 'name', … ), fired as riff.<name>.
 *
 * @param {string} file Absolute path.
 * @return {Array} Hooks found.
 */
function hooksIn( file ) {
	const src = fs.readFileSync( file, 'utf8' );
	const lines = src.split( '\n' );
	const js = file.endsWith( '.js' );
	const re = js
		? /(?<![\w.])(emit|filter)\(\s*'([a-z0-9_]+)'/g
		: /(?<![\w>:$])(apply_filters_deprecated|do_action_deprecated|apply_filters|do_action)\(\s*'([a-z0-9_]+)'/g;
	const found = [];
	const claimed = new Map();
	for ( const m of src.matchAll( re ) ) {
		// A WordPress hook Riff applies the way core does, such as https_local_ssl_verify, is core's to document.
		if ( ! js && ! m[ 2 ].startsWith( 'riff' ) ) {
			continue;
		}
		const line = src.slice( 0, m.index ).split( '\n' ).length - 1;
		const open = m.index + m[ 1 ].length;
		const { args, end } = callArgs( src, open );
		const last = src.slice( 0, end ).split( '\n' ).length - 1;
		const action = js ? m[ 1 ] === 'emit' : m[ 1 ].startsWith( 'do_action' );
		const deprecated = m[ 1 ].endsWith( '_deprecated' );
		// The arguments a callback receives: after the name, without a deprecated hook's version and
		// replacement, and for a JavaScript action the detail and the api.
		let passed = args.slice( 1 );
		if ( deprecated ) {
			passed = /^array\s*\(|^\[/.test( passed[ 0 ] || '' ) ? callArgs( passed[ 0 ], passed[ 0 ].indexOf( passed[ 0 ].startsWith( '[' ) ? '[' : '(' ) ).args : passed.slice( 0, 1 );
		}
		// One docblock documents one hook: a second call under the same one is undocumented.
		const block = docblockAbove( lines, line );
		const parsed = parse( block && ! claimed.has( block.start ) ? block.text : null );
		const shares = block && claimed.has( block.start ) ? claimed.get( block.start ) : '';
		if ( block && ! shares ) {
			claimed.set( block.start, js ? `riff.${ m[ 2 ] }` : m[ 2 ] );
		}
		found.push( {
			name: js ? `riff.${ m[ 2 ] }` : m[ 2 ],
			lang: js ? 'js' : 'php',
			type: action ? 'action' : 'filter',
			deprecated,
			file: path.relative( ROOT, file ),
			line: line + 1,
			lastLine: last + 1,
			source: lines.slice( line, last + 1 ).map( ( l ) => l.replace( /^\t+/, '' ) ).join( '\n' ),
			usedBy: js ? null : enclosing( lines, line ),
			shares,
			arity: js && action ? 2 : passed.length,
			...parsed,
		} );
	}
	return found;
}

/**
 * Pulls the summary, description, @since and @param lines out of a docblock, PHP or JSDoc.
 *
 * @param {string|null} block Docblock text.
 * @return {Object} Parsed fields.
 */
function parse( block ) {
	if ( ! block ) {
		return { summary: '', description: '', since: '', changelog: [], params: [], returns: null, typeTag: '', documented: false };
	}
	const text = block
		.split( '\n' )
		.map( ( l ) => l.replace( /^\s*\/?\*+\/?\s?/, '' ).replace( /\s*\*\/$/, '' ) );
	const prose = [];
	const params = [];
	const changelog = [];
	let returns = null;
	let typeTag = '';
	let tags = false;
	for ( const raw of text ) {
		const line = raw.trim();
		const php = /^@param\s+(\S+)\s+(\.{3})?(\$\w+)\s*(.*)$/.exec( line );
		const js = /^@param\s+\{([^}]+)\}\s+(\[)?([\w$.]+)(?:=([^\]]*))?\]?\s*(.*)$/.exec( line );
		const since = /^@since\s+(\S+)\s*(.*)$/.exec( line );
		const ret = /^@returns?\s+(?:\{([^}]+)\}|(\S+))\s*(.*)$/.exec( line );
		const typed = /^@type\s+\{([^}]+)\}/.exec( line );
		if ( php || js ) {
			tags = true;
			const p = php
				? { type: php[ 1 ], name: php[ 3 ], description: php[ 4 ] }
				: { type: js[ 1 ], name: js[ 3 ], description: js[ 5 ], optional: !! js[ 2 ], default: js[ 4 ] };
			// A dotted JSDoc name documents a property of the parameter before it.
			p.property = ! php && p.name.includes( '.' );
			params.push( p );
		} else if ( since ) {
			tags = true;
			changelog.push( { version: since[ 1 ], description: since[ 2 ] || 'Introduced.' } );
		} else if ( ret ) {
			tags = true;
			returns = { type: ret[ 1 ] || ret[ 2 ], description: ret[ 3 ] };
		} else if ( typed ) {
			tags = true;
			typeTag = typed[ 1 ];
		} else if ( line.startsWith( '@' ) ) {
			tags = true;
		} else if ( tags && line && params.length ) {
			// A @param description that wraps onto the next line.
			params[ params.length - 1 ].description += ' ' + line;
		} else if ( ! tags ) {
			prose.push( line );
		}
	}
	const paragraphs = prose
		.join( '\n' )
		.split( /\n\s*\n/ )
		.map( ( p ) => p.replace( /\s+/g, ' ' ).trim() )
		.filter( Boolean );
	return {
		summary: paragraphs[ 0 ] || '',
		description: paragraphs.slice( 1 ).join( '\n\n' ),
		since: changelog[ 0 ]?.version || '',
		changelog,
		params,
		returns,
		typeTag,
		documented: true,
	};
}

/** Every hook, in the order the reference lists them: PHP, then JavaScript; filters, then actions. */
function collect() {
	const hooks = [ ...files( PLUGIN, '.php' ), PLAYER ].flatMap( hooksIn );
	const rank = ( h ) => ( h.lang === 'php' ? 0 : 2 ) + ( h.type === 'filter' ? 0 : 1 );
	hooks.sort( ( a, b ) => rank( a ) - rank( b ) || a.name.localeCompare( b.name ) || a.file.localeCompare( b.file ) || a.line - b.line );
	// A JavaScript name can be both an action and a filter (riff.track is), so its page says which.
	const names = new Map();
	for ( const h of hooks ) {
		names.set( `${ h.lang }:${ h.name }`, ( names.get( `${ h.lang }:${ h.name }` ) || new Set() ).add( h.type ) );
	}
	for ( const h of hooks ) {
		h.slug = names.get( `${ h.lang }:${ h.name }` ).size > 1 ? `${ h.name }-${ h.type }` : h.name;
	}
	return hooks;
}

/**
 * One entry per page: a hook fired from more than one place shares a page, the way the code
 * reference lists every place a core hook fires.
 *
 * @param {Array} hooks From collect().
 * @return {Array} Pages, each with `sources`.
 */
function pages( hooks ) {
	const out = new Map();
	for ( const h of hooks ) {
		const slug = h.slug || h.name;
		if ( ! out.has( slug ) ) {
			out.set( slug, { ...h, slug, sources: [] } );
		}
		out.get( slug ).sources.push( h );
	}
	return [ ...out.values() ];
}

/**
 * Hooks the reference cannot describe truthfully.
 *
 * @param {Array} hooks From collect().
 * @return {string[]} Problems.
 */
function problems( hooks ) {
	const out = [];
	for ( const h of hooks ) {
		const at = `${ h.name } (${ h.file }:${ h.line })`;
		if ( ! h.documented ) {
			out.push( h.shares ? `${ at } and ${ h.shares } share one docblock; give each hook its own` : `${ at } has no docblock; add one above the line it fires on` );
			continue;
		}
		if ( ! h.since ) {
			out.push( `${ at } has no @since` );
		}
		if ( ! h.summary ) {
			out.push( `${ at } has no summary line` );
		}
		const top = h.params.filter( ( p ) => ! p.property );
		if ( top.length !== h.arity ) {
			out.push( `${ at } passes ${ h.arity } argument${ h.arity === 1 ? '' : 's' } but documents ${ top.length } @param` );
		}
	}
	return out;
}

// ---- docs/hooks.md

/**
 * Text for a Markdown table cell: a backslash or a pipe is escaped, so neither can end the cell or
 * escape the character after it.
 *
 * @param {string} text Text.
 * @return {string} Escaped text.
 */
const cell = ( text ) => String( text ).replace( /[\\|]/g, '\\$&' );

function render( hooks ) {
	const section = ( title, list ) => {
		if ( ! list.length ) {
			return '';
		}
		let out = `## ${ title }\n\n`;
		for ( const h of list ) {
			out += `### \`${ h.name }\`\n\n`;
			if ( h.deprecated ) {
				out += 'Deprecated.\n\n';
			}
			out += `${ h.summary || 'No docblock: add one.' }\n\n`;
			if ( h.description ) {
				out += `${ h.description }\n\n`;
			}
			if ( h.since ) {
				out += `Since ${ h.since }. `;
			}
			out += `Fires in \`${ h.file }\`.\n\n`;
			if ( h.params.length ) {
				out += '| Parameter | Type | Description |\n| --- | --- | --- |\n';
				for ( const p of h.params ) {
					out += `| \`${ p.name }\` | \`${ cell( p.type ) }\` | ${ cell( p.description ) } |\n`;
				}
				out += '\n';
			}
		}
		return out;
	};
	const of = ( lang, type ) => pages( hooks.filter( ( h ) => ( h.lang || 'php' ) === lang && h.type === type ) ).sort( ( a, b ) => a.name.localeCompare( b.name ) );
	return (
		'# Hooks\n\n' +
		'Every filter and action Riff fires, generated from the docblocks in the plugin by `npm run docs:hooks`. ' +
		'Do not edit by hand. The stability promise is in .github/SUPPORT.md: a hook listed here keeps its name and parameters ' +
		'within a major version, and goes through a deprecated release before it is removed.\n\n' +
		'The same reference, a page per hook, is on the site under Developers, PHP and JavaScript.\n\n' +
		section( 'Filters', of( 'php', 'filter' ) ) +
		section( 'Actions', of( 'php', 'action' ) ) +
		( hooks.some( ( h ) => h.lang === 'js' )
			? '## JavaScript\n\n' +
			'The player fires these through `wp.hooks` when the page has it. Each action is also dispatched as a ' +
			'`riff:<name>` `CustomEvent` on `#riff` with the same detail, for pages without the WordPress scripts.\n\n' +
			section( 'JavaScript filters', of( 'js', 'filter' ) ).replace( /^## /, '### ' ).replace( /^### `/gm, '#### `' ) +
			section( 'JavaScript actions', of( 'js', 'action' ) ).replace( /^## /, '### ' ).replace( /^### `/gm, '#### `' )
			: '' )
	);
}

// ---- site/developers/hooks/, laid out like developer.wordpress.org/reference/hooks/

const KIND = {
	'php:filter': 'PHP filters',
	'php:action': 'PHP actions',
	'js:filter': 'JavaScript filters',
	'js:action': 'JavaScript actions',
};
const group = ( h ) => KIND[ `${ h.lang }:${ h.type }` ];
const top = ( h ) => h.params.filter( ( p ) => ! p.property );

/** The hook as a call, coloured the way the code reference colours a title. */
function signature( h ) {
	const fn = h.lang === 'js'
		? `wp.hooks.${ h.type === 'filter' ? 'applyFilters' : 'doAction' }`
		: ( h.type === 'filter' ? 'apply_filters' : 'do_action' ) + ( h.deprecated ? '_deprecated' : '' );
	const args = top( h ).map( ( p ) =>
		h.lang === 'js'
			? `<span class="arg-name">${ esc( p.name ) }</span>`
			: `<nobr><span class="arg-type">${ esc( p.type ) }</span> <span class="arg-name">${ esc( p.name ) }</span></nobr>`
	);
	return `<span class="hook-func">${ fn }</span>( '${ esc( h.name ) }'${ args.length ? ', ' + args.join( ', ' ) : '' } )`;
}

/** A callback that does nothing yet, to copy. */
function usage( h ) {
	const names = top( h ).map( ( p ) => p.name );
	if ( h.lang === 'js' ) {
		if ( h.type === 'filter' ) {
			return `wp.hooks.addFilter( '${ h.name }', 'my-plugin', ( ${ names.join( ', ' ) } ) => {\n\treturn ${ names[ 0 ] };\n} );`;
		}
		const event = h.name.replace( /^riff\./, '' );
		return `wp.hooks.addAction( '${ h.name }', 'my-plugin', ( ${ names.join( ', ' ) } ) => {\n} );\n\n// Or, without wp-hooks:\nwindow.riff.on( '${ event }', ( detail ) => {} );`;
	}
	const extra = names.length > 1 ? `, 10, ${ names.length }` : '';
	if ( h.type === 'filter' ) {
		return `add_filter( '${ h.name }', function ( ${ names.join( ', ' ) } ) {\n\treturn ${ names[ 0 ] };\n}${ extra } );`;
	}
	return `add_action( '${ h.name }', function (${ names.length ? ' ' + names.join( ', ' ) + ' ' : '' }) {\n}${ extra } );`;
}

const searchForm = ( action ) => `<form class="hook-search" role="search" action="${ action }"><label class="screen-reader-text" for="hook-q">Search the hooks</label><input id="hook-q" name="q" type="search" placeholder="Search hooks" autocomplete="off"></form>`;

/** A section heading with the anchor link the code reference puts beside each one. */
const h2 = ( id, label ) => `<h2 id="${ id }" class="is-toc-heading"><a href="#${ id }">${ label }</a></h2>`;

function codeBlock( code, first ) {
	if ( ! first ) {
		return `<pre class="wp-block-code"><code>${ esc( code ) }</code></pre>`;
	}
	const rows = code.split( '\n' ).map( ( line, i ) => `<span class="row"><span class="n" aria-hidden="true">${ first + i }</span>${ esc( line ) }</span>` );
	return `<pre class="wp-block-code numbered"><code>${ rows.join( '\n' ) }</code></pre>`;
}

function hookPage( p ) {
	const summary = p.summary || `The ${ p.name } hook.`;
	const toc = [];
	let body = `<section class="summary"><p>${ inline( summary ) }</p>`;
	if ( p.deprecated ) {
		body += '<p class="notice">This hook is deprecated.</p>';
	}
	if ( p.lang === 'js' && p.type === 'action' ) {
		body += `<p>Also dispatched as the <code>riff:${ esc( p.name.replace( /^riff\./, '' ) ) }</code> event on <code>#riff</code>, with the same detail. The event bubbles.</p>`;
	}
	body += '</section>\n';

	if ( p.params.length ) {
		toc.push( [ 'parameters', 'Parameters' ] );
		body += `<section class="parameters">${ h2( 'parameters', 'Parameters' ) }<dl>`;
		const params = top( p );
		for ( const param of params ) {
			const props = p.params.filter( ( q ) => q.property && q.name.startsWith( param.name + '.' ) );
			body += `<dt><code>${ esc( param.name ) }</code><span class="type">${ esc( param.type ) }</span></dt><dd><div class="desc">${ inline( param.description ) }</div>`;
			if ( props.length ) {
				body += '<ul class="param-hash">';
				for ( const q of props ) {
					body += `<li><code>${ esc( q.name.slice( param.name.length + 1 ) ) }</code><span class="type">${ esc( q.type ) }</span><div class="desc">${ inline( q.description ) }</div></li>`;
				}
				body += '</ul>';
			}
			body += '</dd>';
		}
		body += '</dl></section>\n';
	}

	toc.push( [ 'more-information', 'More Information', [ [ 'usage', 'Usage' ] ] ] );
	body += `<section class="explanation">${ h2( 'more-information', 'More Information' ) }`;
	if ( p.description ) {
		body += p.description.split( '\n\n' ).map( ( para ) => `<p>${ inline( para ) }</p>` ).join( '' );
	}
	body += `<h3 id="usage" class="is-toc-heading"><a href="#usage">Usage</a></h3>${ codeBlock( usage( p ) ) }</section>\n`;

	toc.push( [ 'source', 'Source' ] );
	body += `<section class="source">${ h2( 'source', 'Source' ) }`;
	for ( const s of p.sources ) {
		const range = `#L${ s.line }-L${ s.lastLine }`;
		body += `${ codeBlock( s.source, s.line ) }<p class="dot-links"><span class="file"><code>${ esc( s.file ) }</code></span><a href="${ REPO }${ s.file }${ range }">View on GitHub</a></p>`;
	}
	body += '</section>\n';

	const usedBy = p.sources.filter( ( s ) => s.usedBy );
	if ( usedBy.length ) {
		toc.push( [ 'related', 'Related' ] );
		body += `<section class="related">${ h2( 'related', 'Related' ) }<table class="code-table"><thead><tr><th scope="col">Used by</th><th scope="col">Description</th></tr></thead><tbody>`;
		for ( const s of usedBy ) {
			body += `<tr><td><a href="${ REPO }${ s.file }#L${ s.line }">${ esc( s.usedBy.name ) }</a><code>${ esc( s.file ) }</code></td><td>${ inline( s.usedBy.summary ) }</td></tr>`;
		}
		body += '</tbody></table></section>\n';
	}

	toc.push( [ 'changelog', 'Changelog' ] );
	body += `<section class="changelog">${ h2( 'changelog', 'Changelog' ) }<table class="code-table"><thead><tr><th scope="col">Version</th><th scope="col">Description</th></tr></thead><tbody>`;
	for ( const c of [ ...p.changelog ].reverse() ) {
		body += `<tr><td>${ esc( c.version ) }</td><td>${ inline( c.description ) }</td></tr>`;
	}
	body += '</tbody></table></section>\n';

	const list = ( items ) => '<ul>' + items.map( ( [ id, label, sub ] ) => `<li><a href="#${ id }">${ label }</a>${ sub ? list( sub ) : '' }</li>` ).join( '' ) + '</ul>';
	let html = head( `${ p.name }, ${ group( p ).replace( /s$/, '' ).toLowerCase() } | RiffPress`, summary, `developers/hooks/${ p.slug }/`, 3, '../../../web/web.css', 'developers' );
	// A hook sits under its language: PHP / Hooks / riff_accent, or JavaScript / Hooks / riff.track.
	const lang = p.lang === 'js' ? [ 'javascript', 'JavaScript', '#actions-and-filters' ] : [ 'php', 'PHP', '#hooks' ];
	html += localNav( '../../../', lang[ 0 ] );
	html += crumbs( [ [ 'RiffPress', '../../../' ], [ 'Developers', '../../' ], [ lang[ 1 ], `../../${ lang[ 0 ] }/` ], [ 'Hooks', `../../${ lang[ 0 ] }/${ lang[ 2 ] }` ], [ p.name ] ], searchForm( '../' ) );
	html += `<main id="main" class="wrap reference">
<h1 class="code-title">${ signature( p ) }</h1>
<div class="with-toc">
<aside class="toc" aria-label="In this article"><details class="toc-box" open><summary>In this article</summary>${ list( toc ) }</details><p class="to-top"><a href="#main"><span aria-hidden="true">↑</span> Back to top</a></p></aside>
<article class="entry">
${ body }</article>
</div>
</main>
<script>
// Folded on a narrow screen, as the code reference folds it.
if ( window.matchMedia( '(max-width: 1100px)' ).matches ) {
	document.querySelector( '.toc-box' ).open = false;
}
</script>
`;
	return html + FOOT;
}

function indexPage( list ) {
	let html = head( 'Hooks | RiffPress', 'Every filter and action Riff fires, in PHP and in the player, with its parameters and the line it fires on.', 'developers/hooks/', 2, '../../web/web.css', 'developers' );
	html += localNav( '../../', '' );
	html += crumbs( [ [ 'RiffPress', '../../' ], [ 'Developers', '../' ], [ 'Hooks' ] ], searchForm( './' ) );
	html += `<main id="main" class="wrap reference hooks-index">
<h1>Hooks</h1>
<p class="intro">Every filter and action Riff fires, in PHP and in the player. Each page is generated from the docblock above the line the hook fires on, at the commit this site was published from. A hook keeps its name and parameters within a major version.</p>
`;
	for ( const name of Object.values( KIND ) ) {
		const inGroup = list.filter( ( p ) => group( p ) === name );
		if ( ! inGroup.length ) {
			continue;
		}
		html += `<section class="hook-group">${ h2( name.toLowerCase().replace( /\s+/g, '-' ), esc( name ) ) }<ul class="hook-list">`;
		for ( const p of inGroup ) {
			html += `<li><a class="hook-name" href="${ p.slug }/">${ esc( p.name ) }</a><p>${ inline( p.summary ) }</p><p class="meta">Source: <code>${ esc( p.file ) }</code> · Since ${ esc( p.since ) }</p></li>`;
		}
		html += '</ul></section>';
	}
	html += `<p class="none" hidden>No hook matches.</p>
<script>
( () => {
	const input = document.getElementById( 'hook-q' );
	const none = document.querySelector( '.none' );
	const run = () => {
		const q = input.value.trim().toLowerCase();
		let shown = 0;
		for ( const group of document.querySelectorAll( '.hook-group' ) ) {
			let inGroup = 0;
			for ( const li of group.querySelectorAll( 'li' ) ) {
				const hit = ! q || li.textContent.toLowerCase().includes( q );
				li.hidden = ! hit;
				inGroup += hit;
			}
			group.hidden = ! inGroup;
			shown += inGroup;
		}
		none.hidden = shown > 0;
	};
	input.closest( 'form' ).addEventListener( 'submit', ( e ) => e.preventDefault() );
	input.addEventListener( 'input', run );
	input.value = new URLSearchParams( location.search ).get( 'q' ) || '';
	run();
} )();
</script>
</main>
`;
	return html + FOOT;
}

/**
 * Every page of site/developers/hooks/, by absolute path.
 *
 * @param {Array} hooks From collect().
 * @return {Map<string, string>} Path to HTML.
 */
function site( hooks ) {
	const list = pages( hooks );
	const out = new Map();
	out.set( path.join( SITE, 'index.html' ), indexPage( list ) );
	for ( const p of list ) {
		out.set( path.join( SITE, p.slug, 'index.html' ), hookPage( p ) );
	}
	return out;
}

function main() {
	const hooks = collect();
	const markdown = render( hooks );
	const found = problems( hooks );
	if ( process.argv.includes( '--check' ) ) {
		const current = fs.existsSync( OUT ) ? fs.readFileSync( OUT, 'utf8' ) : '';
		if ( current !== markdown ) {
			found.unshift( 'docs/hooks.md is out of date: run npm run docs:hooks' );
		}
		if ( found.length ) {
			found.forEach( ( p ) => console.error( p ) );
			process.exit( 1 );
		}
		console.log( `docs/hooks.md is current (${ hooks.length } hooks)` );
		return;
	}
	fs.mkdirSync( path.dirname( OUT ), { recursive: true } );
	fs.writeFileSync( OUT, markdown );
	fs.rmSync( SITE, { recursive: true, force: true } );
	const written = site( hooks );
	for ( const [ file, html ] of written ) {
		fs.mkdirSync( path.dirname( file ), { recursive: true } );
		fs.writeFileSync( file, html );
	}
	console.log( `Wrote docs/hooks.md and site/developers/hooks/ (${ hooks.length } hooks, ${ written.size - 1 } pages)` );
	if ( found.length ) {
		found.forEach( ( p ) => console.error( p ) );
		process.exit( 1 );
	}
}

if ( require.main === module ) {
	main();
}

module.exports = { cell, hooksIn, parse, render, collect, pages, problems, site, callArgs, docblockAbove, codeBlock, h2, top };
