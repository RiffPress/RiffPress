/* What every section of the player shares and nothing owns: JSON and storage that never throw,
 * times in digits and in words, a sprintf, escaping, the track's subtitle and its small cover, a
 * route's address, a picture's average colour, and a word to a screen reader. The Listen app shares some of these
 * through its own helpers. */

export function parse( json ) {
	try {
		return json ? JSON.parse( json ) : null;
	} catch {
		return null;
	}
}

export function read( store, key ) {
	try {
		return store.getItem( key );
	} catch {
		return null;
	}
}

export function write( store, key, value ) {
	try {
		store.setItem( key, value );
	} catch {
		// Private mode or a full quota: the player works without remembering.
	}
}

export function drop( store, key ) {
	try {
		store.removeItem( key );
	} catch {}
}

// A route's address with a path appended, whether the site has pretty permalinks
// (/wp-json/riff/v1/library/12) or not (/?rest_route=/riff/v1/library/12).
export function route( base, path = '' ) {
	const u = new URL( base, location.href );
	if ( u.searchParams.has( 'rest_route' ) ) {
		u.searchParams.set( 'rest_route', u.searchParams.get( 'rest_route' ) + path );
	} else {
		u.pathname += path;
	}
	return u;
}

// The cover shown for one that does not load: a plain record on charcoal, no words, drawn here so
// it needs no request. The same drawing as Cover::blank(), which ?riff-art answers with for a
// cover the listener may not see.
export const BLANK_COVER =
	'data:image/svg+xml,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" fill="#1e1e1e"/><circle cx="512" cy="512" r="330" fill="#2a2a2a"/><circle cx="512" cy="512" r="110" fill="#333"/><circle cx="512" cy="512" r="12" fill="#1e1e1e"/></svg>'
	);

// Where a cover is drawn, in the player and in the Listen app. A face, the install icon and a
// theme's own pictures are not covers, and keep what the browser does.
const COVERS =
	'.riff-card-art img, .riff-row-art img, .riff-album-cover img, .riff-album-face img, .riff-now-art img, .riff-mosaic img, .riff-app-item-art img, .riff-suggest-art img, .riff-thumb img, img.riff-about-cover, img[data-riff-art]';

// A cover that does not load becomes the blank one, once: its address is kept in
// data-riff-missing, so painting the same track again (paint.js) leaves the blank be rather than
// asking for the cover again, and srcset goes so the browser picks no other size of it.
function blank( img ) {
	if ( ! img.matches?.( COVERS ) || img.getAttribute( 'src' ) === BLANK_COVER ) {
		return;
	}
	img.dataset.riffMissing = img.getAttribute( 'src' ) || '';
	img.removeAttribute( 'srcset' );
	img.src = BLANK_COVER;
}

// Watches every cover on the page, those there now and those drawn later. An image's error does
// not bubble, so one listener catches it on the way down; a cover that failed before this module
// ran is found by decode(), which fails only for an image that cannot be shown.
export function covers( doc = document ) {
	if ( covers.on ) {
		return;
	}
	covers.on = true;
	doc.addEventListener(
		'error',
		( e ) => {
			if ( e.target instanceof HTMLImageElement ) {
				blank( e.target );
			}
		},
		true
	);
	for ( const img of doc.querySelectorAll( COVERS ) ) {
		if ( img.complete && img.getAttribute( 'src' ) ) {
			img.decode().catch( () => img.complete && ! img.naturalWidth && blank( img ) );
		}
	}
}

// Puts a cover's address on an image, unless it is the one that did not load there.
export function cover( img, src ) {
	if ( ! src || img.getAttribute( 'src' ) === src || img.dataset.riffMissing === src ) {
		return;
	}
	delete img.dataset.riffMissing;
	img.src = src;
}

// A picture's average colour, read at eight by eight, and whether dark words read on it: one
// reading a picture, kept for the page. null where it cannot be read, as a cover from another
// origin that does not allow it.
const averages = new Map();
export function average( src ) {
	if ( ! src ) {
		return Promise.resolve( null );
	}
	if ( ! averages.has( src ) ) {
		averages.set(
			src,
			new Promise( ( resolve ) => {
				const img = new Image();
				img.crossOrigin = 'anonymous';
				img.decoding = 'async';
				img.onload = () => {
					try {
						const c = document.createElement( 'canvas' );
						c.width = c.height = 8;
						const ctx = c.getContext( '2d', { willReadFrequently: true } );
						ctx.drawImage( img, 0, 0, 8, 8 );
						const px = ctx.getImageData( 0, 0, 8, 8 ).data;
						const sum = [ 0, 0, 0 ];
						for ( let i = 0; i < px.length; i += 4 ) {
							sum[ 0 ] += px[ i ];
							sum[ 1 ] += px[ i + 1 ];
							sum[ 2 ] += px[ i + 2 ];
						}
						const [ r, g, b ] = sum.map( ( v ) => v / ( px.length / 4 ) );
						resolve( { r, g, b, light: 0.299 * r + 0.587 * g + 0.114 * b > 150 } );
					} catch {
						resolve( null );
					}
				};
				img.onerror = () => resolve( null );
				img.src = src;
			} )
		);
	}
	return averages.get( src );
}

// A time in words, in the page's language, for a screen reader: "7 minutes, 33 seconds" rather
// than "7 colon 33". A browser without Intl.DurationFormat gets the clock's "7:33". The formatter
// is made on first use: the player starts before the module's last lines have run.
export function spoken( seconds ) {
	spoken.words ??= durationWords(
		document.documentElement.lang || undefined
	);
	const s =
		Number.isFinite( seconds ) && seconds > 0 ? Math.floor( seconds ) : 0;
	if ( ! spoken.words ) {
		return time( s );
	}
	return spoken.words( {
		hours: Math.floor( s / 3600 ),
		minutes: Math.floor( ( s % 3600 ) / 60 ),
		seconds: s % 60,
	} );
}
function durationWords( lang ) {
	try {
		const words = new Intl.DurationFormat( lang, { style: 'long' } );
		// Nothing at all is said for no time; the start of a track is "0 seconds".
		const none = new Intl.DurationFormat( lang, {
			style: 'long',
			secondsDisplay: 'always',
		} ).format( { seconds: 0 } );
		return ( d ) => words.format( d ) || none;
	} catch {
		return false;
	}
}

export function time( seconds ) {
	if ( ! Number.isFinite( seconds ) || seconds < 0 ) {
		return '0:00';
	}
	const s = Math.floor( seconds );
	const h = Math.floor( s / 3600 );
	const m = Math.floor( ( s % 3600 ) / 60 );
	const r = String( s % 60 ).padStart( 2, '0' );
	return h
		? `${ h }:${ String( m ).padStart( 2, '0' ) }:${ r }`
		: `${ m }:${ r }`;
}

// Said to a screen reader through WordPress's own live regions (wp.a11y), which sit at the end of
// the body, outside the player: they speak while the player is hidden or Now Playing covers it.
export function speak( message ) {
	window.wp?.a11y?.speak?.( message );
}

export function fmt( pattern, ...values ) {
	let next = 0;
	return String( pattern || '%s' ).replace(
		/%(?:(\d)\$)?s/g,
		( _, place ) => values[ place ? place - 1 : next++ ] ?? ''
	);
}

// The artist and album, or the post the track came from when the file has neither, as a video
// usually does.
export function subtitle( t ) {
	return (
		[ t.artist, t.album ].filter( Boolean ).join( ' • ' ) ||
		t.post?.title ||
		''
	);
}

// A track's cover and the bars that move on it while it plays, for a row and for Up next.
export function rowArt( t ) {
	const art = smallest( t.art ) || t.video?.poster || '';
	return (
		'<span class="riff-row-art">' +
		( art
			? `<img src="${ esc( art ) }" alt="" loading="lazy" decoding="async">`
			: '' ) +
		'<span class="riff-row-state" aria-hidden="true"><i></i><i></i><i></i></span></span>'
	);
}

// Words a screen reader hears inside a control and the eye doesn't: the verb before a row's title,
// and the pauses between its title, its artist and its length. The control is named by what it
// shows, so a listener speaking what they see can say it.
export function sr( words ) {
	return `<span class="riff-app-sr">${ esc( words ) }</span>`;
}

export const PAUSE = sr( ', ' );

export function smallest( art ) {
	return art?.[ 0 ]?.src || '';
}

export function largest( art ) {
	return art?.[ art.length - 1 ]?.src || '';
}

export function esc( value ) {
	return String( value ).replace(
		/[&<>"']/g,
		( c ) =>
			( {
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;',
			} )[ c ]
	);
}

export function hsl( r, g, b ) {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max( r, g, b );
	const min = Math.min( r, g, b );
	const l = ( max + min ) / 2;
	if ( max === min ) {
		return [ 0, 0, l ];
	}
	const d = max - min;
	const s = l > 0.5 ? d / ( 2 - max - min ) : d / ( max + min );
	let h;
	if ( max === r ) {
		h = ( g - b ) / d + ( g < b ? 6 : 0 );
	} else if ( max === g ) {
		h = ( b - r ) / d + 2;
	} else {
		h = ( r - g ) / d + 4;
	}
	return [ h * 60, s, l ];
}

// The red, green and blue of a hue, saturation and lightness, each 0 to 255.
function rgb( h, s, l ) {
	const k = ( n ) => ( n + h / 30 ) % 12;
	const a = s * Math.min( l, 1 - l );
	const f = ( n ) => l - a * Math.max( -1, Math.min( k( n ) - 3, 9 - k( n ), 1 ) );
	return [ f( 0 ), f( 8 ), f( 4 ) ].map( ( v ) => v * 255 );
}

// How light a colour is to the eye, as WCAG counts it, from 0 for black to 1 for white.
export function luminance( [ r, g, b ] ) {
	const lin = ( v ) => {
		v /= 255;
		return v <= 0.04045 ? v / 12.92 : ( ( v + 0.055 ) / 1.055 ) ** 2.4;
	};
	return 0.2126 * lin( r ) + 0.7152 * lin( g ) + 0.0722 * lin( b );
}

// WCAG's contrast between two colours, from 1 to 21.
export function contrast( a, b ) {
	const [ hi, lo ] = [ luminance( a ), luminance( b ) ].sort( ( x, y ) => y - x );
	return ( hi + 0.05 ) / ( lo + 0.05 );
}

// The accent a cover gives the player, from its average colour (average()): the cover's hue, its
// saturation held between 35% and 60% so it never shouts, and light enough to read at 4.5:1 on
// every one of the backgrounds given, as text must and a ring or a bar more than needs. A cover
// that is grey, near black or near white has no hue worth taking, and gives null.
export function coverAccent( c, backgrounds ) {
	if ( ! c ) {
		return null;
	}
	const [ h, s, l ] = hsl( c.r, c.g, c.b );
	const chroma = Math.max( c.r, c.g, c.b ) - Math.min( c.r, c.g, c.b );
	if ( chroma < 24 || s < 0.15 || l < 0.1 || l > 0.94 ) {
		return null;
	}
	const sat = Math.min( Math.max( s, 0.35 ), 0.6 );
	for ( let light = Math.min( Math.max( l, 0.55 ), 0.72 ); light <= 0.95; light += 0.01 ) {
		const colour = rgb( h, sat, light );
		if ( backgrounds.every( ( bg ) => contrast( colour, bg ) >= 4.5 ) ) {
			return colour.map( Math.round );
		}
	}
	return null;
}
