/*
 * The page shell every generated page on the site shares: the head, the nav and the footer, in
 * wordpress.org's tokens. Used by web-pages.js and hooks-reference.js.
 */
const esc = ( s ) => String( s ).replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' ).replace( /"/g, '&quot;' );

/** Inline markup: `code` becomes <code>. */
const inline = ( s ) => esc( s ).replace( /`([^`]+)`/g, '<code>$1</code>' );

function head( title, description, url, depth, css ) {
	const up = '../'.repeat( depth );
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
<div class="nav"><div class="wrap"><a class="mark" href="${ up }"><svg aria-hidden="true" viewBox="0 0 1024 1024" width="32" height="32"><mask id="hole"><rect width="1024" height="1024" fill="#fff"/><circle cx="512" cy="512" r="24" fill="#000"/></mask><g mask="url(#hole)"><circle cx="512" cy="512" r="512" fill="#fff"/><circle cx="512" cy="512" r="171" fill="#3858e9"/></g></svg>RiffPress</a><nav><a href="${ up }#listen">The block</a><a href="${ up }add-music/">Add your music</a><a href="${ up }developers/">Developers</a><a class="btn" href="${ up }download/">Download</a></nav></div></div>
`;
}

const FOOT = `<div class="dots" aria-hidden="true"></div>
<footer><div class="wrap"><span>Riff is free software from <a href="https://github.com/RiffPress">RiffPress</a>.</span><a href="https://github.com/RiffPress/RiffPress">GitHub</a></div></footer>
</body>
</html>
`;

module.exports = { esc, inline, head, FOOT };
