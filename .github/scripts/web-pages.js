#!/usr/bin/env node
/**
 * Writes site/web/: one page, Built on the open web, with a section for each browser API or CSS
 * feature the player uses, from site/web/web.json, and the sitemap. Run `npm run docs:web` to see
 * it locally.
 *
 * The page links the lines it quotes, so it is built by the Pages deploy from the commit it
 * publishes, and is not committed: a committed copy changed with every edit above a quoted line.
 * web.json names a quote by its file and its code, and by the line above it (`after`) only when the
 * code appears earlier in the file too. --check fails when a quote is no longer in its file, and
 * when the committed sitemap is out of date.
 *
 * Usage: node .github/scripts/web-pages.js [--check]
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const ROOT = path.resolve( __dirname, '..', '..' );
const DIR = path.join( ROOT, 'site', 'web' );
const DATA = path.join( DIR, 'web.json' );
const SITEMAP = path.join( ROOT, 'site', 'sitemap.xml' );
// The deploy fills {{commit}} with the SHA it publishes, so every link opens the code as deployed.
const REPO = 'https://github.com/RiffPress/RiffPress/blob/{{commit}}/';
// Where a page's specification may live: WHATWG, W3C (and its CSS and community groups), and TC39.
const SPEC_HOSTS = [
	'https://html.spec.whatwg.org/',
	'https://fetch.spec.whatwg.org/',
	'https://www.w3.org/TR/',
	'https://drafts.csswg.org/',
	'https://wicg.github.io/',
	'https://tc39.es/',
];
const shell = require( './site-shell.js' );
const hooksReference = require( './hooks-reference.js' );
const { esc, inline, referencePage } = shell;

function groups( entries ) {
	const out = new Map();
	for ( const e of entries ) {
		if ( ! out.has( e.group ) ) {
			out.set( e.group, [] );
		}
		out.get( e.group ).push( e );
	}
	return out;
}

const groupId = ( group ) => `group-${ group.toLowerCase().replace( /[^a-z0-9]+/g, '-' ) }`;

/**
 * One feature: what it is for, how Riff uses it, why, what happens without it, and the lines that
 * call it, each linked at the commit the page was published from.
 *
 * @param {Object} e An entry of web.json.
 * @return {string} HTML.
 */
function feature( e ) {
	let html = `<section class="feature"><h3 id="${ e.slug }" class="is-toc-heading"><a href="#${ e.slug }">${ esc( e.name ) }</a></h3>
<p class="feature-summary">${ inline( e.summary ) }</p>
<h4>How Riff uses it</h4>
<p>${ inline( e.how ) }</p>
<h4>Why</h4>
<p>${ inline( e.why ) }</p>
`;
	if ( e.fallback ) {
		html += `<h4>Without it</h4>\n<p>${ inline( e.fallback ) }</p>\n`;
	}
	html += '<h4>Where</h4>\n<ul class="where">';
	for ( const w of e.where ) {
		html += `<li><a href="${ REPO }${ w.file }#L${ w.line }">${ esc( w.file ) }, line ${ w.line }</a><pre><code>${ esc( w.code ) }</code></pre></li>`;
	}
	return html + `</ul>
<p class="fine">Specification: <a href="${ esc( e.spec.url ) }">${ esc( e.spec.name ) }</a>. Reference: <a href="${ esc( e.mdn ) }">${ esc( e.name ) } on MDN</a>.</p>
</section>
`;
}

function index( entries ) {
	let body = '<section class="summary"><p>Every browser API and CSS feature the player uses, how and why it uses each, and what happens without it. The lines quoted open at the commit this page was published from.</p></section>\n';
	const toc = [];
	for ( const [ group, list ] of groups( entries ) ) {
		toc.push( [ groupId( group ), group, list.map( ( e ) => [ e.slug, e.name ] ) ] );
		body += `<section class="features"><h2 id="${ groupId( group ) }" class="is-toc-heading"><a href="#${ groupId( group ) }">${ esc( group ) }</a></h2>\n${ list.map( feature ).join( '' ) }</section>\n`;
	}
	return referencePage( {
		title: 'Built on the open web',
		description: 'Every browser API and CSS feature the Riff player calls, each with how and why it is used.',
		url: 'web/',
		h1: '<h1>Built on the open web</h1>',
		toc,
		body,
	} );
}

function sitemap() {
	const nav = require( './site-nav.js' );
	let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
	const pages = [ ...nav.entries().values() ].map( ( e ) => e.node.href ).filter( ( h ) => typeof h === 'string' );
	for ( const p of pages ) {
		xml += `  <url><loc>{{pages_url}}${ p }</loc><changefreq>monthly</changefreq><priority>${ p === 'developers/' || p === 'download/' ? '0.9' : '0.6' }</priority></url>\n`;
	}
	for ( const p of hooksReference.pages( hooksReference.collect() ) ) {
		xml += `  <url><loc>{{pages_url}}developers/hooks/${ p.slug }/</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>\n`;
	}
	return xml + '</urlset>\n';
}

/**
 * Finds each quoted line in its file as it is now: the first line holding the code, after the line
 * that is `after`, exactly as written, when there is one. A quote, or its `after`, that is gone is a problem, as is an
 * `after` that appears more than once, since then it does not say which.
 *
 * @param {Array} entries The pages. Each quote is given its `line`.
 * @return {string[]} Problems found.
 */
function verify( entries ) {
	const problems = [];
	const cache = new Map();
	for ( const e of entries ) {
		// Every page cites the standard that defines its feature, published by a standards body, so
		// the reference is the spec itself and not only a description of it.
		if ( ! e.spec?.name || ! SPEC_HOSTS.some( ( h ) => ( e.spec.url || '' ).startsWith( h ) ) ) {
			problems.push( `${ e.slug }: needs a spec in site/web/web.json, a { name, url } on ${ SPEC_HOSTS.join( ', ' ) }` );
		}
		for ( const w of e.where ) {
			if ( ! cache.has( w.file ) ) {
				const file = path.join( ROOT, w.file );
				cache.set( w.file, fs.existsSync( file ) ? fs.readFileSync( file, 'utf8' ).split( '\n' ) : [] );
			}
			const lines = cache.get( w.file );
			let from = 0;
			if ( w.after ) {
				const anchors = lines.flatMap( ( l, i ) => ( l === w.after ? [ i ] : [] ) );
				if ( anchors.length !== 1 ) {
					problems.push( `${ e.slug }: ${ w.file } has "${ w.after }" ${ anchors.length ? anchors.length + ' times' : 'no longer' }; give site/web/web.json an after it has once` );
					continue;
				}
				from = anchors[ 0 ] + 1;
			}
			const at = lines.findIndex( ( l, i ) => i >= from && l.includes( w.code ) );
			if ( at < 0 ) {
				problems.push( `${ e.slug }: ${ w.file } no longer has "${ w.code }"${ w.after ? ` after "${ w.after }"` : '' }; update site/web/web.json` );
				continue;
			}
			w.line = at + 1;
		}
	}
	return problems;
}

function build() {
	const entries = JSON.parse( fs.readFileSync( DATA, 'utf8' ) );
	const problems = verify( entries );
	if ( problems.length ) {
		problems.forEach( ( p ) => console.error( p ) );
		process.exit( 1 );
	}
	const files = new Map();
	files.set( path.join( DIR, 'index.html' ), index( entries ) );
	files.set( SITEMAP, sitemap() );
	return files;
}

function main() {
	const check = process.argv.includes( '--check' );
	const files = build();
	let stale = 0;
	for ( const [ file, content ] of files ) {
		// Only the sitemap is committed; the pages are checked by building them, above.
		if ( check && file !== SITEMAP ) {
			continue;
		}
		const current = fs.existsSync( file ) ? fs.readFileSync( file, 'utf8' ) : null;
		if ( current === content ) {
			continue;
		}
		stale++;
		if ( check ) {
			console.error( `${ path.relative( ROOT, file ) } is out of date; run npm run docs:web` );
		} else {
			fs.mkdirSync( path.dirname( file ), { recursive: true } );
			fs.writeFileSync( file, content );
		}
	}
	// The pages each feature had of its own, before it was a section of the one page.
	for ( const entry of check ? [] : fs.readdirSync( DIR, { withFileTypes: true } ) ) {
		const file = path.join( DIR, entry.name, 'index.html' );
		if ( entry.isDirectory() && ! files.has( file ) ) {
			stale++;
			fs.rmSync( path.join( DIR, entry.name ), { recursive: true } );
		}
	}
	if ( check && stale ) {
		process.exit( 1 );
	}
	const count = JSON.parse( fs.readFileSync( DATA, 'utf8' ) ).length;
	console.log( check ? `site/web's quotes are all in place (${ count } features)` : `site/web written (${ count } features, one page)` );
}

if ( require.main === module ) {
	main();
}

module.exports = { build };
