/*
 * The page shell every generated page on the site shares: the head, the nav and the footer, in
 * wordpress.org's tokens. Used by web-pages.js and hooks-reference.js.
 */
const esc = ( s ) => String( s ).replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' ).replace( /"/g, '&quot;' );

/** Inline markup: `code` becomes <code>. */
const inline = ( s ) => esc( s ).replace( /`([^`]+)`/g, '<code>$1</code>' );

/**
 * The document head and the global bar.
 *
 * @param {string} title       Title.
 * @param {string} description Meta description.
 * @param {string} url         Path from the site root.
 * @param {number} depth       How many folders deep the page is.
 * @param {string} css         The stylesheet's address from the page.
 * @param {string} section     The global link this page sits under, marked current: 'developers' or ''.
 * @return {string} HTML.
 */
function head( title, description, url, depth, css, section = '' ) {
	const up = '../'.repeat( depth );
	// The share card: a page below a section shows its section's (og-images.js draws them).
	const card = url.startsWith( 'web/' ) ? 'web' : url.startsWith( 'developers/' ) ? 'developers' : 'home';
	const dev = section === 'developers' ? ' aria-current="true"' : '';
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${ esc( title ) }</title>
<meta name="description" content="${ esc( description ) }">
<meta property="og:type" content="article">
<meta property="og:site_name" content="RiffPress">
<meta property="og:url" content="{{pages_url}}${ url }">
<meta property="og:title" content="${ esc( title ) }">
<meta property="og:description" content="${ esc( description ) }">
<meta property="og:image" content="{{pages_url}}og/${ card }.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${ esc( title ) }">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${ esc( title ) }">
<meta name="twitter:description" content="${ esc( description ) }">
<meta name="twitter:image" content="{{pages_url}}og/${ card }.png">
<link rel="canonical" href="{{pages_url}}${ url }">
<link rel="icon" href="${ up }icons/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${ up }icons/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="${ up }icons/apple-touch-icon.png">
<meta name="theme-color" content="#000">
<meta name="color-scheme" content="light">
<link rel="stylesheet" href="${ css }">
<link rel="stylesheet" href="${ up }neck.css">
</head>
<body data-neck="margin">
<a class="skip" href="#main">Skip to content</a>
<div class="nav"><div class="wrap"><a class="mark" href="${ up }"><img src="${ up }brand/wordmark-ink.svg" alt="Riff" width="64" height="30"></a><nav><a href="${ up }add-music/">Add your music</a><a href="${ up }developers/"${ dev }>Developers</a><a class="btn" href="${ up }download/">Download</a></nav></div></div>
`;
}

/**
 * The global footer: the licence, and the links every page of wordpress.org carries at its foot
 * (here the accessibility statement, security, support and the source).
 *
 * @param {string} up Path back to the site root.
 * @return {string} HTML.
 */
const foot = ( up ) => `<footer><div class="wrap"><span>Riff is free software from <a href="https://github.com/RiffPress">RiffPress</a>, under the GPL.</span><nav aria-label="Footer"><a href="${ up }accessibility/">Accessibility</a><a href="https://github.com/RiffPress/RiffPress/blob/main/SECURITY.md">Security</a><a href="https://github.com/RiffPress/RiffPress/blob/main/.github/SUPPORT.md">Support</a><a href="https://github.com/RiffPress/RiffPress">GitHub</a></nav></div></footer>
<script type="module" src="${ up }js/neck.js"></script>
</body>
</html>
`;

/**
 * The Developers bar under the global one, as each developer.wordpress.org section has one: one
 * entry per thing a developer writes or calls, then the background reading. Every page under
 * /developers/ and /web/ carries it.
 *
 * @param {string} up      Path back to the site root.
 * @param {string} current Which entry this page is under: 'developers', 'php', 'javascript',
 *                         'rest', 'css' or 'web'.
 * @return {string} HTML.
 */
function localNav( up, current ) {
	const attr = ( key ) => {
		if ( key !== current ) {
			return '';
		}
		return key === 'developers' ? ' aria-current="page"' : ' aria-current="true"';
	};
	const links = [
		[ 'php', 'developers/php/', 'PHP' ],
		[ 'javascript', 'developers/javascript/', 'JavaScript' ],
		[ 'rest', 'developers/rest/', 'REST API' ],
		[ 'css', 'developers/css/', 'CSS' ],
	]
		.map( ( [ key, href, label ] ) => `<a href="${ up }${ href }"${ attr( key ) }>${ label }</a>` )
		.join( '' );
	return `<div class="local-nav"><div class="wrap"><a class="local-title" href="${ up }developers/"${ attr( 'developers' ) }>Developers</a><nav aria-label="Developers">${ links }<a class="aside-link" href="${ up }web/"${ attr( 'web' ) }>Built on the open web</a></nav></div></div>
`;
}

/**
 * The breadcrumb strip, as wordpress.org sets it: grey links, a light slash between. The bar
 * above already says Riff and Developers, and marks a page one level under it, so the trail
 * starts below Developers and a page with only itself in it has none; the strip stays only for
 * what sits at its right, such as a search form.
 *
 * @param {Array}  trail  [ label, href ] pairs; the last, without an href, is the page.
 * @param {string} extra  HTML for the right-hand side, such as a search form.
 * @return {string} HTML.
 */
function crumbs( trail, extra = '' ) {
	if ( trail.length < 2 ) {
		return extra ? `<div class="crumbs"><div class="wrap">${ extra }</div></div>
` : '';
	}
	const parts = trail.map( ( [ label, href ] ) => ( href ? `<span><a href="${ href }">${ esc( label ) }</a></span>` : `<span class="is-current-page">${ esc( label ) }</span>` ) );
	return `<div class="crumbs"><div class="wrap"><nav aria-label="Breadcrumbs">${ parts.join( '' ) }</nav>${ extra }</div></div>
`;
}

/**
 * A reference page, laid out like developer.wordpress.org's code reference: the bar, the
 * breadcrumbs, a title, and the article with "In this article" beside it.
 *
 * @param {Object} page             The page.
 * @param {string} page.title       The document title.
 * @param {string} page.description Meta description.
 * @param {string} page.url         Path from the site root, ending in a slash.
 * @param {string} page.current     The bar entry it sits under.
 * @param {Array}  page.trail       Breadcrumbs below Developers, as [ label, href ].
 * @param {string} page.h1          The heading's HTML, with its attributes.
 * @param {Array}  page.toc         [ id, label, children ] entries for "In this article".
 * @param {string} page.body        The article.
 * @param {string} page.search      HTML for the right of the breadcrumbs.
 * @return {string} HTML.
 */
function referencePage( { title, description, url, current, trail, h1, toc, body, search = '' } ) {
	const depth = url.split( '/' ).filter( Boolean ).length;
	const up = '../'.repeat( depth );
	// A long route wraps before one of its slashes, not inside a word.
	const list = ( items ) => '<ul>' + items.map( ( [ id, label, sub ] ) => `<li><a href="#${ id }">${ esc( label ).replace( /(.)\//g, '$1<wbr>/' ) }</a>${ sub ? list( sub ) : '' }</li>` ).join( '' ) + '</ul>';
	let html = head( title, description, url, depth, `${ up }web/web.css`, 'developers' );
	html += localNav( up, current );
	html += crumbs( trail, search );
	html += `<main id="main" class="wrap reference">
${ h1 }
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
	return html + foot( up );
}

module.exports = { esc, inline, head, foot, localNav, crumbs, referencePage };
