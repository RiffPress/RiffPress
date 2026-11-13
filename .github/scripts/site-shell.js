/*
 * The page shell every generated page on the site shares: the head, the navigation and the footer,
 * in wordpress.org's tokens, the navigation drawn from site-nav.json by site-nav.js.
 */
const nav = require( './site-nav.js' );

const esc = ( s ) => String( s ).replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' ).replace( /"/g, '&quot;' );

/** Inline markup: `code` becomes <code>. */
const inline = ( s ) => esc( s ).replace( /`([^`]+)`/g, '<code>$1</code>' );

/**
 * The document head, then the page's navigation from site-nav.json: the skip link, the header and
 * the section bar.
 *
 * @param {string} title       Title; the host's name is put after it.
 * @param {string} description Meta description.
 * @param {string} url         Path from the site root.
 * @param {number} depth       How many folders deep the page is.
 * @param {string} css         The stylesheet's address from the page.
 * @param {Object} where       Where the page sits, for a page site-nav.json does not list.
 * @param {string} where.under The entry it sits under, as 'php' for a PHP hook.
 * @param {string} where.label Its own name, for the phone's Menu button.
 * @return {string} HTML.
 */
function head( title, description, url, depth, css, { under = '', label = '' } = {} ) {
	const up = '../'.repeat( depth );
	const ctx = nav.locate( url, { under, label } );
	const name = nav.title( ctx, title );
	// The share card: a page below a section shows its section's (og-images.js draws them).
	const card = url.startsWith( 'web/' ) ? 'web' : url.startsWith( 'developers/' ) ? 'developers' : 'home';
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${ esc( name ) }</title>
<meta name="description" content="${ esc( description ) }">
<meta property="og:type" content="article">
<meta property="og:site_name" content="RiffPress">
<meta property="og:url" content="{{pages_url}}${ url }">
<meta property="og:title" content="${ esc( name ) }">
<meta property="og:description" content="${ esc( description ) }">
<meta property="og:image" content="{{pages_url}}og/${ card }.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${ esc( name ) }">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${ esc( name ) }">
<meta name="twitter:description" content="${ esc( description ) }">
<meta name="twitter:image" content="{{pages_url}}og/${ card }.png">
<link rel="canonical" href="{{pages_url}}${ url }">
<link rel="icon" href="${ up }icons/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${ up }icons/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="${ up }icons/apple-touch-icon.png">
<meta name="theme-color" content="#ffffff">
<meta name="color-scheme" content="light">
<link rel="preload" href="${ up }fonts/schibsted-grotesk.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${ up }fonts/eb-garamond.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${ up }tokens.css">
<link rel="stylesheet" href="${ css }">
</head>
<body>
${ nav.header( ctx, up ) }${ nav.sectionBar( ctx, up ) }`;
}

/**
 * The footer from site-nav.json, and the docs' script: the sidebar's Menu on a phone, and the
 * section being read marked in "On this page".
 *
 * @param {string} up  Path back to the site root.
 * @param {Object} ctx Where the page sits, from site-nav.js's locate(), to mark its own link.
 * @return {string} HTML.
 */
const foot = ( up, ctx = null ) => `${ nav.footer( ctx, up ) }<script type="module" src="${ up }js/docs.js"></script>
</body>
</html>
`;

/**
 * The handbooks: where each is published under /developers/, the doc handbook-pages.js builds it
 * from, and its name on its own page. Their order and their names in the bar are site-nav.json's.
 */
const HANDBOOKS = [
	// The lessons for whoever runs a site, one task each.
	{ slug: 'music', file: 'docs/learn/media-library.md', label: 'Your music' },
	{ slug: 'album', file: 'docs/learn/album.md', label: 'An album' },
	{ slug: 'post', file: 'docs/learn/post.md', label: 'Music in a post' },
	{ slug: 'listen-page', file: 'docs/learn/listen-page.md', label: 'The Listen page' },
	{ slug: 'app', file: 'docs/learn/app.md', label: 'The app' },
	{ slug: 'lyrics', file: 'docs/learn/lyrics.md', label: 'Lyrics' },
	{ slug: 'rights', file: 'docs/learn/rights.md', label: 'Rights and controls' },
	{ slug: 'sign-in', file: 'docs/learn/sign-in.md', label: 'Signing in' },
	{ slug: 'network', file: 'docs/learn/network.md', label: 'Clients and networks' },
	// For developers.
	{ slug: 'extensions', file: 'docs/extensions.md', label: 'Extensions' },
	{ slug: 'player', file: 'docs/player.md', label: 'How the player works' },
	{ slug: 'isolation', file: 'docs/isolation.md', label: 'Isolation' },
	// For whoever runs Riff for others.
	{ slug: 'verify', file: 'docs/verify.md', label: 'Verifying a release' },
	// For whoever works on Riff itself.
	{ slug: 'contributing', file: '.github/CONTRIBUTING.md', label: 'Contributing' },
	{ slug: 'native', file: 'docs/native.md', label: 'What WordPress has' },
];

/**
 * A reference page: a title, and the article with "On this page" beside it where it has more than
 * one section to go to, and at its end where to edit it.
 *
 * @param {Object} page             The page.
 * @param {string} page.title       The document title.
 * @param {string} page.description Meta description.
 * @param {string} page.url         Path from the site root, ending in a slash.
 * @param {string} page.under       The site-nav.json entry it sits under, for a page it does not list.
 * @param {string} page.label       Its own name, for a page it does not list.
 * @param {string} page.h1          The heading's HTML, with its attributes.
 * @param {Array}  page.toc         [ id, label, children ] entries for "On this page".
 * @param {string} page.body        The article.
 * @param {string} page.edit        Where the page's source is edited, for a page written by hand.
 * @return {string} HTML.
 */
function referencePage( { title, description, url, under = '', label = '', h1, toc, body, edit = '' } ) {
	const depth = url.split( '/' ).filter( Boolean ).length;
	const up = '../'.repeat( depth );
	// A long route wraps before one of its slashes, not inside a word.
	const list = ( items ) => '<ul>' + items.map( ( [ id, words, sub ] ) => `<li><a href="#${ id }">${ esc( words ).replace( /(.)\//g, '$1<wbr>/' ) }</a>${ sub ? list( sub ) : '' }</li>` ).join( '' ) + '</ul>';
	const ctx = nav.locate( url, { under, label } );
	let html = head( title, description, url, depth, `${ up }web/web.css`, { under, label } );
	html += `<main id="main" class="wrap reference">
${ h1 }
<div class="with-toc">
${ toc.length > 1 ? `<aside class="toc" aria-label="On this page"><details class="toc-box" open><summary>On this page</summary>${ list( toc ) }</details></aside>` : '' }
<article class="entry">
${ body }${ edit ? `<p class="edit"><a href="${ esc( edit ) }">Edit this page on GitHub</a></p>
` : '' }${ nav.pager( ...nav.siblings( ctx, up ) ) }</article>
</div>
</main>
<script>
// Folded on a narrow screen, as the code reference folds it.
if ( window.matchMedia( '(max-width: 1199.98px)' ).matches ) {
	const toc = document.querySelector( '.toc-box' );
	if ( toc ) {
		toc.open = false;
	}
}
</script>
`;
	return html + foot( up, ctx );
}

module.exports = { esc, inline, head, foot, referencePage, HANDBOOKS, pager: nav.pager };
