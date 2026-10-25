/* Riff Lyrics: fills the Lyrics tab beside Up next with the lyrics WordPress keeps on the track's
 * file, from the media REST route. It listens to the player's riff:tab, riff:track and riff:time
 * events, which Riff dispatches on its own element for any script, so it needs nothing loaded
 * before it. Lyrics whose lines start with a timestamp, as the LRC format and most taggers write
 * them, follow the music: the line being sung is marked and kept in view, and a tap on a line
 * seeks to it through window.riff.seek(). Timed lyrics are the song's transcript: a switch above
 * them shows the same words as plain text, in one piece (WCAG 1.2.1 and 1.2.2). */
( () => {
	const config = window.riffLyrics || {};
	const cache = new Map();
	let showing = false;
	let turn = 0; // So a slow answer for an earlier track cannot replace the current one's.
	let lines = []; // The synced lines showing, each { time, el }, in time order.
	let current = -1;
	let scrolledAt = 0; // When the listener last scrolled the lyrics by hand.
	let asText = false; // The transcript view: timed lyrics shown as plain text.
	let shown = null; // What is showing: { where, text }, so the switch can draw it again.

	const panel = () => document.querySelector( '[data-riff-panel="lyrics"]' );
	// Until the player starts, window.riff is the #riff element, by its id.
	const player = () => ( typeof window.riff?.seek === 'function' ? window.riff : null );

	// The lyrics for a track that is a Media Library file; an empty string for none.
	function lyricsFor( track ) {
		const id = Number( track?.id );
		if ( ! Number.isInteger( id ) || id <= 0 ) {
			return Promise.resolve( '' );
		}
		if ( ! cache.has( id ) ) {
			const url = new URL( String( id ), config.media );
			// The whole of media_details: the media route builds it only when asked for by that name.
			url.searchParams.set( '_fields', 'media_details' );
			const asked = fetch( url, {
				credentials: 'same-origin',
				headers: {
					Accept: 'application/json',
					...( config.nonce ? { 'X-WP-Nonce': config.nonce } : {} ),
				},
			} )
				.then( ( r ) => {
					if ( ! r.ok ) {
						throw new Error( String( r.status ) );
					}
					return r.json();
				} )
				.then( ( data ) =>
					String( data?.media_details?.unsynchronised_lyric || '' ).trim()
				);
			asked.catch( () => cache.delete( id ) );
			cache.set( id, asked );
		}
		return cache.get( id );
	}

	// A line's timestamps, [mm:ss.xx] or [mm:ss], one or more at its start, as LRC writes them;
	// LRC's tag lines ([ar:...], [ti:...]) are not lyrics.
	const STAMPS = /^\s*((?:\[\d{1,3}:\d{1,2}(?:\.\d{1,3})?\]\s*)+)(.*)$/;
	const STAMP = /\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/g;
	const TAG = /^\s*\[[a-z]+:[^\]]*\]\s*$/i;

	// The lines with their times, or null when none has one. A blank line is a gap before the next;
	// a line without a time among timed ones is shown with the one before it.
	function parse( text ) {
		const out = [];
		let synced = false;
		let gap = false;
		let last = 0;
		for ( const raw of text.split( /\r?\n/ ) ) {
			if ( TAG.test( raw ) ) {
				continue;
			}
			if ( ! raw.trim() ) {
				gap = out.length > 0;
				continue;
			}
			const m = raw.match( STAMPS );
			if ( ! m ) {
				out.push( { time: last, text: raw.trim(), gap } );
			} else {
				synced = true;
				for ( const s of m[ 1 ].matchAll( STAMP ) ) {
					last = Number( s[ 1 ] ) * 60 + Number( s[ 2 ] );
					out.push( { time: last, text: m[ 2 ].trim(), gap } );
				}
			}
			gap = false;
		}
		if ( ! synced ) {
			return null;
		}
		// A chorus line can carry every time it is sung: the lines are shown in the order they are heard.
		return out
			.map( ( line, i ) => ( { ...line, i } ) )
			.sort( ( a, b ) => a.time - b.time || a.i - b.i );
	}

	function say( where, text, className ) {
		const p = document.createElement( 'p' );
		p.className = className;
		p.textContent = text;
		where.replaceChildren( p );
	}

	// The switch between the timed lines and the transcript, above timed lyrics only.
	function switcher() {
		const button = document.createElement( 'button' );
		button.type = 'button';
		button.className = 'riff-lyrics-switch';
		button.textContent = asText ? config.timed || '' : config.text || '';
		button.setAttribute( 'aria-pressed', String( asText ) );
		button.addEventListener( 'click', () => {
			asText = ! asText;
			if ( shown ) {
				show( shown.where, shown.text );
			}
			shown?.where.querySelector( '.riff-lyrics-switch' )?.focus();
		} );
		return button;
	}

	function show( where, text ) {
		lines = [];
		current = -1;
		shown = { where, text };
		const synced = parse( text );
		if ( ! synced ) {
			say( where, text, 'riff-lyrics' );
			return;
		}
		if ( asText ) {
			// The transcript: the lines in the order they are heard, without their times.
			const p = document.createElement( 'p' );
			p.className = 'riff-lyrics riff-lyrics-transcript';
			p.textContent = synced.map( ( line ) => line.text ).filter( Boolean ).join( '\n' );
			where.replaceChildren( switcher(), p );
			return;
		}
		const list = document.createElement( 'ol' );
		list.className = 'riff-lyrics riff-lyrics-synced';
		lines = synced.map( ( line ) => {
			const li = document.createElement( 'li' );
			if ( line.gap ) {
				li.className = 'riff-lyrics-gap';
			}
			const button = document.createElement( 'button' );
			button.type = 'button';
			button.className = 'riff-lyrics-line';
			button.textContent = line.text || '♪';
			button.addEventListener( 'click', () => player()?.seek( line.time ) );
			li.append( button );
			list.append( li );
			return { time: line.time, el: li };
		} );
		where.replaceChildren( switcher(), list );
		follow( player()?.time?.() ?? 0 );
	}

	// Marks the line whose time has come and keeps it in the middle of the panel, unless the
	// listener has just scrolled the lyrics themselves.
	function follow( time ) {
		if ( ! lines.length ) {
			return;
		}
		let i = -1;
		while ( i + 1 < lines.length && lines[ i + 1 ].time <= time + 0.05 ) {
			i++;
		}
		if ( i === current ) {
			return;
		}
		lines[ current ]?.el.removeAttribute( 'aria-current' );
		current = i;
		if ( i < 0 ) {
			return;
		}
		lines[ i ].el.setAttribute( 'aria-current', 'true' );
		if ( showing && Date.now() - scrolledAt > 4000 ) {
			centre( lines[ i ].el );
		}
	}

	function centre( el ) {
		let box = el.parentElement;
		while (
			box &&
			! (
				box.scrollHeight > box.clientHeight &&
				/auto|scroll/.test( getComputedStyle( box ).overflowY )
			)
		) {
			box = box.parentElement;
		}
		if ( ! box ) {
			return;
		}
		const line = el.getBoundingClientRect();
		const view = box.getBoundingClientRect();
		box.scrollTo( {
			top: box.scrollTop + ( line.top - view.top ) - ( view.height - line.height ) / 2,
			behavior: matchMedia( '(prefers-reduced-motion: reduce)' ).matches ? 'auto' : 'smooth',
		} );
	}

	async function fill( where, track ) {
		if ( ! where ) {
			return;
		}
		const mine = ++turn;
		lines = [];
		current = -1;
		shown = null;
		if ( ! track ) {
			say( where, config.idle || '', 'riff-lyrics-note' );
			return;
		}
		try {
			const text = await lyricsFor( track );
			if ( mine !== turn ) {
				return;
			}
			if ( text ) {
				show( where, text );
			} else {
				say( where, config.none || '', 'riff-lyrics-note' );
			}
		} catch {
			if ( mine === turn ) {
				say( where, config.error || '', 'riff-lyrics-note' );
			}
		}
	}

	document.addEventListener( 'riff:tab', ( e ) => {
		showing = e.detail?.id === 'lyrics';
		if ( showing ) {
			fill( e.detail.panel, e.detail.track );
		}
	} );
	document.addEventListener( 'riff:track', ( e ) => {
		if ( showing ) {
			fill( panel(), e.detail?.track );
		}
	} );
	document.addEventListener( 'riff:time', ( e ) => follow( Number( e.detail?.time ) || 0 ) );
	// A wheel or a finger on the lyrics is the listener's scrolling, which the following gives way to.
	for ( const ev of [ 'wheel', 'touchmove' ] ) {
		document.addEventListener(
			ev,
			( e ) => {
				if ( lines.length && e.target.closest?.( '[data-riff-panel="lyrics"]' ) ) {
					scrolledAt = Date.now();
				}
			},
			{ passive: true }
		);
	}
} )();
