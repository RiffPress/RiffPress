#!/usr/bin/env node
/**
 * The navigation of source.riffpress.com, drawn from site-nav.json: the header, the section bar, the
 * breadcrumbs, the previous and next links and the footer, and each page's title.
 *
 * site-shell.js draws them into every generated page. The pages written by hand carry them between
 * markers, which this stamps, leaving the rest of the page alone:
 *
 *   <!-- nav:top -->…<!-- /nav:top -->        the skip link, header, section bar and breadcrumbs
 *   <!-- nav:pager -->…<!-- /nav:pager -->    previous and next, where the page has siblings in order
 *   <!-- nav:footer -->…<!-- /nav:footer -->  the footer
 *
 * Every link is written relative to the page, as the sources are laid out; developers-site.js then
 * points each at where the host serves it.
 *
 * --check changes nothing and fails when a page written by hand has drifted from the definition,
 * has no markers, or belongs to no section, or when the definition itself is inconsistent.
 *
 * Usage: node .github/scripts/site-nav.js [--check]
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { execFileSync } = require( 'node:child_process' );
const NAV = require( './site-nav.json' );

const ROOT = path.resolve( __dirname, '..', '..' );
const SITE = path.join( ROOT, 'site' );

// A link from the page to an entry; from the root to itself is "./", never an empty href.
const to = ( up, href ) => up + href || './';

const esc = ( s ) => String( s ).replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' ).replace( /"/g, '&quot;' );

/**
 * Every entry of the definition by key, each with its parent and section.
 *
 * @param {Object} nav The definition.
 * @return {Map<string, Object>} key => { node, parent, section }.
 */
function entries( nav = NAV ) {
	const out = new Map();
	const walk = ( node, parent, section ) => {
		out.set( node.key, { node, parent, section } );
		for ( const child of node.children || [] ) {
			walk( child, node, section );
		}
	};
	for ( const section of nav.sections ) {
		walk( section, null, section );
	}
	return out;
}

/**
 * Where a page sits: its section and the entries from the section down to it.
 *
 * @param {string} url     The page's path on the site, as "developers/php/".
 * @param {Object} o       Options.
 * @param {string} o.under The entry the page sits under, when it is not in the definition (a hook).
 * @param {string} o.label The page's own name, when it is not in the definition.
 * @param {Object} o.nav   The definition.
 * @return {Object} { section, trail: entries from the section down, node, leaf, url }.
 */
function locate( url, { under = '', label = '', nav = NAV } = {} ) {
	const all = entries( nav );
	let found = under ? all.get( under ) : null;
	if ( under && ! found ) {
		throw new Error( `${ url }: no entry "${ under }" in site-nav.json` );
	}
	if ( ! found ) {
		found = [ ...all.values() ].find( ( e ) => e.node.href === url );
	}
	if ( ! found ) {
		// The deepest entry whose path holds the page: web/ for web/inert/.
		found = [ ...all.values() ]
			.filter( ( e ) => e.node.href && url.startsWith( e.node.href ) )
			.sort( ( a, b ) => b.node.href.length - a.node.href.length )[ 0 ];
	}
	if ( ! found ) {
		throw new Error( `${ url || 'the page at the root' } belongs to no section in site-nav.json` );
	}
	const own = found.node.href === url && ! under;
	if ( ! own && ! label ) {
		throw new Error( `${ url } sits under ${ found.node.key } and needs a label of its own` );
	}
	const trail = [];
	for ( let key = found.node.key; key; ) {
		const e = all.get( key );
		trail.unshift( e.node );
		key = e.parent?.key;
	}
	return { section: found.section, trail, node: found.node, leaf: own ? '' : label, url, nav };
}

/**
 * aria-current for a link to `node` on the page `ctx`: "page" on the page itself, "true" on an
 * entry above it.
 *
 * @param {Object} ctx  From locate(), or null.
 * @param {Object} node An entry.
 * @return {string} The attribute, with its leading space, or nothing.
 */
function current( ctx, node ) {
	if ( ! ctx || ! ctx.trail.includes( node ) ) {
		return '';
	}
	return node === ctx.node && ! ctx.leaf ? ' aria-current="page"' : ' aria-current="true"';
}

/**
 * The header: the wordmark, leading to the host's home, then each section, the one the page is in
 * marked.
 *
 * @param {Object} ctx From locate(), or null where no section is current (the 404).
 * @param {string} up  The path back to the site's root.
 * @param {Object} nav The definition.
 * @return {string} HTML.
 */
function header( ctx, up, nav = NAV ) {
	// The wordmark leads to the host's home, the section marked root.
	const mark = nav.sections.find( ( s ) => s.root );
	const links = nav.sections.map( ( s ) => `<a href="${ to( up, s.href ) }"${ current( ctx, s ) }>${ esc( s.label ) }</a>` ).join( '' );
	return `<a class="skip" href="#main">Skip to content</a>
<header class="nav"><div class="wrap"><a class="mark" href="${ to( up, mark.href ) }"${ ctx && ctx.node === mark && ! ctx.leaf ? ' aria-current="page"' : '' }><img src="${ up }brand/wordmark-ink.svg" alt="${ esc( nav.hosts[ mark.host ] ) }" width="64" height="30"></a><nav aria-label="Main">${ links }</nav></div></header>
`;
}

/**
 * The section bar, for a section with pages of its own to list: its pages, a group as its name and
 * its pages. The section's own name is the header's, marked there, so the bar doesn't repeat it.
 *
 * @param {Object} ctx From locate(), or null.
 * @param {string} up  The path back to the site's root.
 * @return {string} HTML, or nothing.
 */
function sectionBar( ctx, up ) {
	const shown = ( list ) => ( list || [] ).filter( ( n ) => n.bar !== false );
	if ( ! ctx || ! shown( ctx.section.children ).length ) {
		return '';
	}
	const s = ctx.section;
	const item = ( n ) => {
		if ( n.children ) {
			return `<li class="local-group"><span class="local-label">${ esc( n.label ) }</span><ul>${ shown( n.children ).map( item ).join( '' ) }</ul></li>`;
		}
		return `<li><a href="${ to( up, n.href ) }"${ current( ctx, n ) }>${ esc( n.label ) }</a></li>`;
	};
	return `<div class="local-nav"><div class="wrap"><nav aria-label="${ esc( s.label ) }"><ul>${ shown( s.children ).map( item ).join( '' ) }</ul></nav></div></div>
`;
}

/**
 * The breadcrumbs, from the section down to the page, on every page below a section's root. A
 * group with no page of its own is named without a link. A section's root has none; the strip is
 * kept there only for what sits at its right, such as a search form.
 *
 * @param {Object} ctx   From locate(), or null.
 * @param {string} up    The path back to the site's root.
 * @param {string} extra HTML for the right-hand side.
 * @return {string} HTML, or nothing.
 */
function crumbs( ctx, up, extra = '' ) {
	const trail = ctx ? ctx.trail.map( ( n ) => [ n.label, n.href ] ) : [];
	if ( ctx?.leaf ) {
		trail.push( [ ctx.leaf ] );
	}
	if ( trail.length < 2 ) {
		return extra ? `<div class="crumbs"><div class="wrap">${ extra }</div></div>
` : '';
	}
	const parts = trail.map( ( [ label, href ], i ) => {
		if ( i === trail.length - 1 ) {
			return `<li aria-current="page">${ esc( label ) }</li>`;
		}
		return typeof href === 'string' ? `<li><a href="${ to( up, href ) }">${ esc( label ) }</a></li>` : `<li>${ esc( label ) }</li>`;
	} );
	return `<div class="crumbs"><div class="wrap"><nav aria-label="Breadcrumbs"><ol>${ parts.join( '' ) }</ol></nav>${ extra }</div></div>
`;
}

/**
 * Previous and next, between pages in an order.
 *
 * @param {Array} prev [ label, href ] or null.
 * @param {Array} next [ label, href ] or null.
 * @return {string} HTML, or nothing when there is neither.
 */
function pager( prev, next ) {
	if ( ! prev && ! next ) {
		return '';
	}
	const link = ( pair, rel, word ) => ( pair ? `<a rel="${ rel }" href="${ pair[ 1 ] }"><span class="pager-dir">${ word }</span> <span class="pager-name">${ esc( pair[ 0 ] ) }</span></a>` : '<span></span>' );
	return `<nav class="pager" aria-label="Previous and next">${ link( prev, 'prev', 'Previous' ) }${ link( next, 'next', 'Next' ) }</nav>
`;
}

/**
 * The page's neighbours in its group, where the group is ordered, as pager() takes them.
 *
 * @param {Object} ctx From locate().
 * @param {string} up  The path back to the site's root.
 * @return {Array} [ prev, next ], or [ null, null ].
 */
function siblings( ctx, up ) {
	if ( ! ctx || ctx.leaf ) {
		return [ null, null ];
	}
	const parent = entries( ctx.nav ).get( ctx.node.key ).parent;
	if ( ! parent?.ordered ) {
		return [ null, null ];
	}
	const list = parent.children.filter( ( n ) => n.bar !== false );
	const i = list.indexOf( ctx.node );
	const pair = ( n ) => ( n ? [ n.label, to( up, n.href ) ] : null );
	return [ pair( list[ i - 1 ] ), pair( list[ i + 1 ] ) ];
}

/**
 * The footer: the license, then each group of links, the page's own marked.
 *
 * @param {Object} ctx From locate(), or null.
 * @param {string} up  The path back to the site's root.
 * @return {string} HTML.
 */
function footer( ctx, up ) {
	const nav = ctx?.nav || NAV;
	const all = entries( nav );
	const groups = nav.footer.map( ( g ) => {
		const links = g.links.map( ( l ) => {
			if ( typeof l === 'string' ) {
				const n = all.get( l ).node;
				return `<li><a href="${ to( up, n.href ) }"${ ctx && ctx.node === n && ! ctx.leaf ? ' aria-current="page"' : '' }>${ esc( n.label ) }</a></li>`;
			}
			return `<li><a href="${ esc( l.href ) }">${ esc( l.label ) }</a></li>`;
		} );
		return `<div class="foot-group"><p class="foot-label" id="foot-${ g.key }">${ esc( g.label ) }</p><ul aria-labelledby="foot-${ g.key }">${ links.join( '' ) }</ul></div>`;
	} );
	return `<footer><div class="wrap"><p class="foot-license">Riff is free software from <a href="https://github.com/RiffPress">RiffPress</a>, under the GPL.</p><nav aria-label="Footer">${ groups.join( '' ) }</nav></div></footer>
`;
}

/**
 * A page's title with its host's name after it: "PHP | Riff Source". The host's root is titled
 * with the host's name alone.
 *
 * @param {Object} ctx  From locate(), or null.
 * @param {string} text The title, with or without a name after it.
 * @return {string} The title.
 */
function title( ctx, text ) {
	if ( ! ctx ) {
		return text;
	}
	// A host's home is titled with the host's name alone: "Riff Source".
	if ( ctx.node.root && ! ctx.leaf ) {
		return ctx.nav.hosts[ ctx.node.host ];
	}
	const bare = text.replace( /\s*\|\s*Riff(?:Press)?(?: Source)?$/, '' );
	return `${ bare } | ${ ctx.nav.hosts[ ctx.node.host || ctx.section.host ] }`;
}

const REGION = ( name ) => new RegExp( `<!-- nav:${ name }((?: [a-z]+)*) -->\\n?[\\s\\S]*?<!-- /nav:${ name } -->`, 'g' );

/**
 * A page written by hand, with its navigation stamped from the definition.
 *
 * @param {string} html The page.
 * @param {string} file Its path under site/, as "built/index.html".
 * @param {Object} nav  The definition.
 * @return {{ html: string, problems: string[] }} The page, and what is wrong with it.
 */
function stamp( html, file, nav = NAV ) {
	const problems = [];
	const lost = file === '404.html';
	const url = file.replace( /(^|\/)index\.html$/, '$1' );
	// The 404 is served at whatever address was missed, so its links are absolute and nothing is current.
	const up = lost ? '{{pages_url}}' : '../'.repeat( url.split( '/' ).length - 1 );
	let ctx = null;
	if ( ! lost ) {
		try {
			ctx = locate( url, { nav } );
		} catch ( e ) {
			return { html, problems: [ `site/${ file }: ${ e.message }` ] };
		}
	}
	for ( const name of [ 'top', 'footer' ] ) {
		if ( ! html.match( REGION( name ) ) ) {
			problems.push( `site/${ file }: no <!-- nav:${ name } --> … <!-- /nav:${ name } --> markers` );
		}
	}
	if ( ! /<main id="main"/.test( html ) ) {
		problems.push( `site/${ file }: the skip link needs <main id="main">` );
	}
	let out = html.replace( REGION( 'top' ), ( m, opts ) => `<!-- nav:top${ opts } -->\n${ header( ctx, up, nav ) }${ sectionBar( ctx, up ) }${ crumbs( ctx, up ) }<!-- /nav:top -->` );
	out = out.replace( REGION( 'pager' ), ( m, opts ) => `<!-- nav:pager${ opts } -->\n${ pager( ...siblings( ctx, up ) ) }<!-- /nav:pager -->` );
	out = out.replace( REGION( 'footer' ), ( m, opts ) => `<!-- nav:footer${ opts } -->\n${ footer( ctx, up ) }<!-- /nav:footer -->` );
	if ( ctx && siblings( ctx, up ).some( Boolean ) && ! html.match( REGION( 'pager' ) ) ) {
		problems.push( `site/${ file }: has pages beside it in order, so it needs <!-- nav:pager --> … <!-- /nav:pager -->` );
	}
	out = out
		.replace( /<title>([^<]*)<\/title>/, ( m, t ) => `<title>${ title( ctx, t ) }</title>` )
		.replace( /(<meta (?:property="og:title"|property="og:image:alt"|name="twitter:title") content=")([^"]*)(">)/g, ( m, a, t, b ) => a + title( ctx, t ) + b );
	return { html: out, problems };
}

/**
 * What is wrong with the definition itself: a key or a page named twice, a footer link to no entry,
 * a host with no name, a page developers-site.js would not move to the host, or no one home.
 *
 * @param {Object} nav The definition.
 * @return {string[]} Problems.
 */
function validate( nav = NAV ) {
	const problems = [];
	const { MOVED } = require( './developers-site.js' );
	const keys = new Set();
	const hrefs = new Set();
	const walk = ( node, section ) => {
		if ( keys.has( node.key ) ) {
			problems.push( `site-nav.json: the key "${ node.key }" is used twice` );
		}
		keys.add( node.key );
		if ( node.children ) {
			node.children.forEach( ( c ) => walk( c, section ) );
		} else if ( typeof node.href !== 'string' ) {
			problems.push( `site-nav.json: ${ node.key } has no href` );
		}
		if ( typeof node.href === 'string' ) {
			if ( hrefs.has( node.href ) ) {
				problems.push( `site-nav.json: ${ node.href || 'the root' } is listed twice` );
			}
			hrefs.add( node.href );
			const moves = MOVED.some( ( [ from ] ) => node.href.startsWith( from ) );
			if ( ! moves ) {
				problems.push( `site-nav.json: ${ node.key } (${ node.href }) is a page developers-site.js does not publish` );
			}
		}
	};
	for ( const s of nav.sections ) {
		walk( s, s );
		if ( ! nav.hosts[ s.host ] ) {
			problems.push( `site-nav.json: no name in hosts for ${ s.host || s.key }` );
		}
	}
	if ( nav.sections.filter( ( s ) => s.root ).length !== 1 ) {
		problems.push( 'site-nav.json: one section, and only one, is the host\'s home (root)' );
	}
	// Every handbook handbook-pages.js publishes is in the Handbook group, so it is in the bar.
	const { HANDBOOKS } = require( './site-shell.js' );
	const handbook = ( nav.sections.flatMap( ( s ) => s.children || [] ).find( ( n ) => n.key === 'handbook' )?.children || [] ).map( ( n ) => n.href );
	for ( const h of HANDBOOKS ) {
		if ( ! handbook.includes( `developers/${ h.slug }/` ) ) {
			problems.push( `site-nav.json: the handbook developers/${ h.slug }/ is not in the Handbook group` );
		}
	}
	for ( const g of nav.footer ) {
		for ( const l of g.links ) {
			if ( typeof l === 'string' && ! keys.has( l ) ) {
				problems.push( `site-nav.json: the footer links to "${ l }", which is no entry` );
			}
		}
	}
	return problems;
}

/**
 * The pages written by hand: every page under site/ that git tracks or would, and not the ones the
 * generators build, which it ignores.
 *
 * @return {string[]} Paths under site/.
 */
function handWritten() {
	return execFileSync( 'git', [ 'ls-files', '--cached', '--others', '--exclude-standard', 'site' ], { cwd: ROOT, encoding: 'utf8' } )
		.split( '\n' )
		.filter( ( f ) => f.endsWith( '.html' ) && fs.existsSync( path.join( ROOT, f ) ) )
		.map( ( f ) => f.slice( 'site/'.length ) )
		.sort();
}

function main() {
	const check = process.argv.includes( '--check' );
	const problems = validate();
	const stale = [];
	for ( const file of handWritten() ) {
		const before = fs.readFileSync( path.join( SITE, file ), 'utf8' );
		const { html, problems: found } = stamp( before, file );
		problems.push( ...found );
		if ( html !== before ) {
			if ( check ) {
				stale.push( `site/${ file }` );
			} else {
				fs.writeFileSync( path.join( SITE, file ), html );
				console.log( `Stamped site/${ file }` );
			}
		}
	}
	if ( stale.length ) {
		problems.push( `${ stale.join( ', ' ) }: the navigation differs from site-nav.json; run npm run docs:nav` );
	}
	if ( problems.length ) {
		problems.forEach( ( p ) => console.error( p ) );
		process.exit( 1 );
	}
	if ( check ) {
		console.log( 'Every page written by hand carries the navigation in site-nav.json' );
	}
}

module.exports = { NAV, entries, locate, current, header, sectionBar, crumbs, pager, siblings, footer, title, stamp, validate, handWritten };

if ( require.main === module ) {
	main();
}
