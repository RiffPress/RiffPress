#!/usr/bin/env node
/**
 * Writes site/web/: one page per browser API or CSS feature the player uses, from site/web/web.json,
 * plus the index of them and the sitemap. Run `npm run docs:web`; CI checks the output is current.
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
const shell = require( './site-shell.js' );
const hooksReference = require( './hooks-reference.js' );
const { esc, inline, FOOT, localNav, crumbs } = shell;
const head = ( title, description, url, depth ) =>
	shell.head( title, description, url, depth, `${ depth === 2 ? '../' : '' }web.css`, 'developers' ) + localNav( '../'.repeat( depth ), 'web' );

const SHOTS = {
	'phone-now-playing': { wide: false, alt: 'Now Playing on a phone: the cover, the title and artist, a seek bar, and the play controls' },
	'phone-post': { wide: false, alt: 'A post with its tracks listed, and the player bar along the bottom of the screen' },
	'phone-up-next': { wide: false, alt: 'Now Playing with the Up next sheet open, listing the rest of the post\'s tracks' },
	'desktop-now-playing': { wide: true, alt: 'Now Playing on a wide screen: the Song and Video switch at the top, the cover on the left, the Up next list on the right, and the player bar along the bottom' },
	'desktop-listen': { wide: true, alt: 'The Listen page: the library, nine albums as drawn record covers' },
};

function picture( shot ) {
	const s = SHOTS[ shot.image ];
	if ( ! s ) {
		throw new Error( `Unknown screenshot ${ shot.image }` );
	}
	const base = `../../${ shot.image }`;
	if ( s.wide ) {
		return `<picture><source type="image/avif" srcset="${ base }.avif 2880w, ${ base }-1440.avif 1440w" sizes="(max-width: 1200px) 100vw, 760px"><img class="desk" src="${ base }.png" width="2880" height="1800" alt="${ esc( s.alt ) }" loading="lazy" decoding="async"></picture>`;
	}
	return `<span class="device"><picture><source type="image/avif" srcset="${ base }.avif"><img src="${ base }.png" width="780" height="1688" alt="${ esc( s.alt ) }" loading="lazy" decoding="async"></picture></span>`;
}

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

function sidebar( entries, current, depth ) {
	const up = depth === 2 ? '../' : '';
	let html = `<aside class="side" aria-label="All the features"><p class="side-title"><a href="${ up }">Built on the open web</a></p>`;
	for ( const [ group, list ] of groups( entries ) ) {
		html += `<h2>${ esc( group ) }</h2><ul>`;
		for ( const e of list ) {
			const here = e.slug === current;
			html += here ? `<li><a href="${ up }${ e.slug }/" aria-current="page">${ esc( e.name ) }</a></li>` : `<li><a href="${ up }${ e.slug }/">${ esc( e.name ) }</a></li>`;
		}
		html += '</ul>';
	}
	return html + '</aside>';
}

function page( e, i, entries ) {
	const prev = entries[ i - 1 ];
	const next = entries[ i + 1 ];
	let html = head( `${ e.name }, RiffPress`, e.summary, `web/${ e.slug }/`, 2 );
	html += crumbs( [ [ 'RiffPress', '../../' ], [ 'Developers', '../../developers/' ], [ 'Built on the open web', '../' ], [ e.name ] ] );
	html += `<div class="wrap layout">
<main id="main">
<h1>${ esc( e.name ) }</h1>
<p class="lede">${ inline( e.summary ) }</p>
<figure>${ picture( e.shot ) }<figcaption>${ inline( e.shot.caption ) }</figcaption></figure>
<h2>How Riff uses it</h2>
<p>${ inline( e.how ) }</p>
<h2>Why</h2>
<p>${ inline( e.why ) }</p>
`;
	if ( e.fallback ) {
		html += `<h2>Without it</h2>\n<p>${ inline( e.fallback ) }</p>\n`;
	}
	html += '<h2>Where</h2>\n<ul class="where">';
	for ( const w of e.where ) {
		html += `<li><a href="${ REPO }${ w.file }#L${ w.line }">${ esc( w.file ) }, line ${ w.line }</a><pre><code>${ esc( w.code ) }</code></pre></li>`;
	}
	html += `</ul>
<p class="fine">Links open the source at the commit this page was published from.</p>
<p class="fine">Reference: <a href="${ esc( e.mdn ) }">${ esc( e.name ) } on MDN</a>.</p>
<nav class="pager" aria-label="Previous and next">${ prev ? `<a rel="prev" href="../${ prev.slug }/">${ esc( prev.name ) }</a>` : '<span></span>' }${ next ? `<a rel="next" href="../${ next.slug }/">${ esc( next.name ) }</a>` : '<span></span>' }</nav>
</main>
${ sidebar( entries, e.slug, 2 ) }
</div>
`;
	return html + FOOT;
}

function index( entries ) {
	let html = head( 'Built on the open web, RiffPress', 'Every browser API and CSS feature the Riff player calls, each with how and why it is used.', 'web/', 1 );
	html += crumbs( [ [ 'RiffPress', '../' ], [ 'Developers', '../developers/' ], [ 'Built on the open web' ] ] );
	html += `<main id="main" class="wrap index">
<h1>Built on the open web</h1>
<p class="lede">Every browser API and CSS feature the player calls, and what each one is for. A music player touches a lot of them, which is part of the point.</p>
<div class="groups">`;
	for ( const [ group, list ] of groups( entries ) ) {
		html += `<section><h2>${ esc( group ) }</h2><ul>`;
		for ( const e of list ) {
			html += `<li><a href="${ e.slug }/">${ esc( e.name ) }</a><span>${ inline( e.summary ) }</span></li>`;
		}
		html += '</ul></section>';
	}
	return html + '</div>\n</main>\n' + FOOT;
}

function sitemap( entries ) {
	let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
	xml += '  <url><loc>{{pages_url}}</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n';
	xml += '  <url><loc>{{pages_url}}download/</loc><changefreq>monthly</changefreq><priority>0.9</priority></url>\n';
	xml += '  <url><loc>{{pages_url}}developers/</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n';
	xml += '  <url><loc>{{pages_url}}add-music/</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>\n';
	xml += '  <url><loc>{{pages_url}}web/</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>\n';
	for ( const e of entries ) {
		xml += `  <url><loc>{{pages_url}}web/${ e.slug }/</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>\n`;
	}
	for ( const p of [ 'php', 'javascript', 'rest', 'css' ] ) {
		xml += `  <url><loc>{{pages_url}}developers/${ p }/</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>\n`;
	}
	xml += '  <url><loc>{{pages_url}}developers/hooks/</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>\n';
	for ( const p of hooksReference.pages( hooksReference.collect() ) ) {
		xml += `  <url><loc>{{pages_url}}developers/hooks/${ p.slug }/</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>\n`;
	}
	return xml + '</urlset>\n';
}

/**
 * Every quoted line must still be at the line it claims, or the link would point at the wrong code.
 * When the writer runs, a line that moved is found again (the nearest line holding the same code)
 * and the data updated; the check only reports it, so a commit that moved code without running
 * the writer fails. A quoted line that is gone altogether is a problem either way.
 *
 * @param {Array}   entries The pages.
 * @param {boolean} fix     Whether to move line numbers to where the code is now.
 * @return {{problems: string[], moved: number}} Problems found, and lines moved.
 */
function verify( entries, fix ) {
	const problems = [];
	let moved = 0;
	const cache = new Map();
	for ( const e of entries ) {
		for ( const w of e.where ) {
			if ( ! cache.has( w.file ) ) {
				const file = path.join( ROOT, w.file );
				cache.set( w.file, fs.existsSync( file ) ? fs.readFileSync( file, 'utf8' ).split( '\n' ) : null );
			}
			const lines = cache.get( w.file );
			const actual = lines ? lines[ w.line - 1 ] : undefined;
			if ( actual !== undefined && actual.includes( w.code ) ) {
				continue;
			}
			const hits = lines ? lines.map( ( l, i ) => ( l.includes( w.code ) ? i + 1 : 0 ) ).filter( Boolean ) : [];
			if ( ! hits.length ) {
				problems.push( `${ e.slug }: ${ w.file } no longer has "${ w.code }"; update site/web/web.json` );
			} else if ( fix ) {
				w.line = hits.reduce( ( a, b ) => ( Math.abs( b - w.line ) < Math.abs( a - w.line ) ? b : a ) );
				moved++;
			} else {
				problems.push( `${ e.slug }: ${ w.file }:${ w.line } does not contain "${ w.code }" (it moved); run npm run docs:web` );
			}
		}
	}
	return { problems, moved };
}

function build( fix ) {
	const entries = JSON.parse( fs.readFileSync( DATA, 'utf8' ) );
	const { problems, moved } = verify( entries, fix );
	if ( problems.length ) {
		problems.forEach( ( p ) => console.error( p ) );
		process.exit( 1 );
	}
	if ( moved ) {
		fs.writeFileSync( DATA, JSON.stringify( entries, null, '\t' ) + '\n' );
		console.log( `site/web/web.json: ${ moved } quoted line${ moved === 1 ? '' : 's' } moved with the code` );
	}
	const files = new Map();
	files.set( path.join( DIR, 'index.html' ), index( entries ) );
	entries.forEach( ( e, i ) => files.set( path.join( DIR, e.slug, 'index.html' ), page( e, i, entries ) ) );
	files.set( SITEMAP, sitemap( entries ) );
	return files;
}

const check = process.argv.includes( '--check' );
const files = build( ! check );
let stale = 0;
for ( const [ file, content ] of files ) {
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
// Pages whose entry was removed.
for ( const entry of fs.readdirSync( DIR, { withFileTypes: true } ) ) {
	const file = path.join( DIR, entry.name, 'index.html' );
	if ( entry.isDirectory() && ! files.has( file ) ) {
		stale++;
		if ( check ) {
			console.error( `${ path.relative( ROOT, file ) } has no entry in web.json` );
		} else {
			fs.rmSync( path.join( DIR, entry.name ), { recursive: true } );
		}
	}
}
if ( check && stale ) {
	process.exit( 1 );
}
console.log( check ? `site/web is current (${ files.size - 2 } pages)` : `site/web written (${ files.size - 2 } pages)` );
