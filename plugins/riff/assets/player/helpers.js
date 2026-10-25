/* What every section of the player shares and nothing owns: JSON and storage that never throw,
 * times in digits and in words, a sprintf, escaping, the track's subtitle and its small cover, and
 * a word to a screen reader. */

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
