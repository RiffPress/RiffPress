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
