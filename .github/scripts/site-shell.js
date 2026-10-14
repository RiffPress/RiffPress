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
<meta property="og:image" content="{{pages_url}}og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="{{pages_url}}${ url }">
<link rel="icon" href="${ up }icons/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${ up }icons/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="${ up }icons/apple-touch-icon.png">
<meta name="theme-color" content="#1e1e1e">
<meta name="color-scheme" content="light">
<link rel="stylesheet" href="${ css }">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="nav"><div class="wrap"><a class="mark" href="${ up }"><svg aria-hidden="true" viewBox="0 0 1024 1024" width="32" height="32"><mask id="hole"><rect width="1024" height="1024" fill="#fff"/><circle cx="512" cy="512" r="24" fill="#000"/></mask><g mask="url(#hole)"><circle cx="512" cy="512" r="512" fill="#fff"/><circle cx="512" cy="512" r="171" fill="#3858e9"/></g></svg>RiffPress</a><nav><a href="${ up }#listen">The block</a><a href="${ up }add-music/">Add your music</a><a href="${ up }developers/"${ dev }>Developers</a><a class="btn" href="${ up }download/">Download</a></nav></div></div>
`;
}

const FOOT = `<div class="dots" aria-hidden="true"></div>
<footer><div class="wrap"><span>Riff is free software from <a href="https://github.com/RiffPress">RiffPress</a>.</span><a href="https://github.com/RiffPress/RiffPress">GitHub</a></div></footer>
</body>
</html>
`;

/**
 * The Developers bar under the global one, as each developer.wordpress.org section has one.
 * Every page under /developers/ and /web/ carries it.
 *
 * @param {string} up      Path back to the site root.
 * @param {string} current Which page this is: 'developers', 'hooks' or 'web'.
 * @return {string} HTML.
 */
function localNav( up, current ) {
	const attr = ( key ) => {
		if ( key !== current ) {
			return '';
		}
		return key === 'developers' ? ' aria-current="page"' : ' aria-current="true"';
	};
	return `<div class="local-nav"><div class="wrap"><a class="local-title" href="${ up }developers/"${ attr( 'developers' ) }>Developers</a><nav aria-label="Developers"><a href="${ up }developers/hooks/"${ attr( 'hooks' ) }>Hooks</a><a href="${ up }web/"${ attr( 'web' ) }>Built on the open web</a><a href="https://github.com/RiffPress/RiffPress/blob/main/docs/javascript.md">JavaScript</a></nav></div></div>
`;
}

/**
 * The breadcrumb strip, as wordpress.org sets it: grey links, a light slash between.
 *
 * @param {Array}  trail  [ label, href ] pairs; the last, without an href, is the page.
 * @param {string} extra  HTML for the right-hand side, such as a search form.
 * @return {string} HTML.
 */
function crumbs( trail, extra = '' ) {
	const parts = trail.map( ( [ label, href ] ) => ( href ? `<span><a href="${ href }">${ esc( label ) }</a></span>` : `<span class="is-current-page">${ esc( label ) }</span>` ) );
	return `<div class="crumbs"><div class="wrap"><nav aria-label="Breadcrumbs">${ parts.join( '' ) }</nav>${ extra }</div></div>
`;
}

module.exports = { esc, inline, head, FOOT, localNav, crumbs };
