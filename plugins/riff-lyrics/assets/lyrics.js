/* Riff Lyrics: fills the Lyrics tab beside Up next with the lyrics WordPress keeps on the track's
 * file, from the media REST route. It listens to the player's riff:tab, riff:track and riff:time
 * events, which Riff dispatches on its own element for any script, so it needs nothing loaded
 * before it. Timed lyrics follow the music: the line being sung is marked and kept in view, and a
 * tap on a line seeks to it through window.riff.seek(). They are read in the formats players and
 * taggers already write: LRC, with its [offset:] tag and Enhanced LRC's <mm:ss.xx> word times, whose
 * words light up as they are sung; WebVTT, the web's own timed text; and an ID3 SYLT frame, which
 * the plugin turns into LRC when the file is uploaded. The lines are text, read as a list, so
 * they are the song's transcript as they stand (WCAG 1.2.1 and 1.2.2). */
( () => {
	const config = window.riffLyrics || {};
	const cache = new Map();
	let showing = false;
	let turn = 0; // So a slow answer for an earlier track cannot replace the current one's.
	let lines = []; // The synced lines showing, each { time, el }, in time order.
	let current = -1;
	let scrolledAt = 0; // When the listener last scrolled the lyrics by hand.

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
	// [offset:+250]: milliseconds the whole file is early by, so every line is shown that much sooner.
	const OFFSET = /^\s*\[offset:\s*([+-]?\d+)\s*\]\s*$/im;
	// Enhanced LRC's word times inside a line: <mm:ss.xx>word.
	const WORD = /<(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)>/g;
	// A WebVTT cue's timing line: [hh:]mm:ss.ttt --> [hh:]mm:ss.ttt, then any settings.
	const CUE = /^\s*((?:\d+:)?\d{1,2}:\d{2}\.\d{3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}\.\d{3})/;

	const seconds = ( stamp ) =>
		stamp.split( ':' ).reduce( ( total, part ) => total * 60 + Number( part ), 0 );

	// A line's words with their times, when Enhanced LRC gives them, and the line's text without them.
	function words( text, offset ) {
		const marks = [ ...text.matchAll( WORD ) ];
		if ( ! marks.length ) {
			return { text, words: null };
		}
		const out = [];
		marks.forEach( ( m, i ) => {
			const end = marks[ i + 1 ]?.index ?? text.length;
			const word = text.slice( m.index + m[ 0 ].length, end );
			if ( word.trim() ) {
				out.push( { time: Number( m[ 1 ] ) * 60 + Number( m[ 2 ] ) - offset, text: word } );
			}
		} );
		const lead = text.slice( 0, marks[ 0 ].index );
		if ( lead.trim() ) {
			out.unshift( { time: null, text: lead } );
		}
		return { text: text.replace( WORD, '' ).replace( /\s+/g, ' ' ).trim(), words: out };
	}

	// WebVTT: each cue is a line, at the time it starts; a pause of two seconds or more is a gap.
	function parseVtt( text ) {
		const out = [];
		const blocks = text.replace( /\r/g, '' ).split( /\n\s*\n/ );
		let end = 0;
		for ( const block of blocks ) {
			const rows = block.split( '\n' );
			const at = rows.findIndex( ( row ) => CUE.test( row ) );
			if ( at < 0 ) {
				continue;
			}
			const [ , from, to ] = rows[ at ].match( CUE );
			const said = rows
				.slice( at + 1 )
				.join( ' ' )
				.replace( /[<>]/g, '' )
				.trim();
			const time = seconds( from );
			out.push( { time, text: said, gap: out.length > 0 && time - end >= 2, words: null } );
			end = seconds( to );
		}
		return out.length ? out.map( ( line, i ) => ( { ...line, i } ) ) : null;
	}

	// The lines with their times, or null when none has one. A blank line is a gap before the next;
	// a line without a time among timed ones is shown with the one before it.
	function parse( text ) {
		if ( /^\uFEFF?WEBVTT/.test( text ) ) {
			return parseVtt( text );
		}
		const out = [];
		let synced = false;
		let gap = false;
		let last = 0;
		const offset = Number( text.match( OFFSET )?.[ 1 ] || 0 ) / 1000;
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
				out.push( { time: last, ...words( raw.trim(), offset ), gap } );
			} else {
				synced = true;
				for ( const s of m[ 1 ].matchAll( STAMP ) ) {
					last = Math.max( 0, Number( s[ 1 ] ) * 60 + Number( s[ 2 ] ) - offset );
					out.push( { time: last, ...words( m[ 2 ].trim(), offset ), gap } );
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

	function show( where, text ) {
		lines = [];
		current = -1;
		const synced = parse( text );
		if ( ! synced ) {
			say( where, text, 'riff-lyrics' );
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
			// Enhanced LRC's words are spans that light up as they are sung; the button's name is
			// still the whole line.
			const sung = [];
			if ( line.words ) {
				for ( const w of line.words ) {
					const span = document.createElement( 'span' );
					span.className = 'riff-lyrics-word';
					span.textContent = w.text;
					button.append( span );
					if ( w.time !== null ) {
						sung.push( { time: w.time, el: span } );
					}
				}
			} else {
				button.textContent = line.text || '♪';
			}
			button.addEventListener( 'click', () => player()?.seek( line.time ) );
			li.append( button );
			list.append( li );
			return { time: line.time, el: li, words: sung };
		} );
		where.replaceChildren( list );
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
		for ( const w of lines[ i ]?.words || [] ) {
			w.el.classList.toggle( 'is-sung', w.time <= time + 0.05 );
		}
		if ( i === current ) {
			return;
		}
		for ( const w of lines[ current ]?.words || [] ) {
			w.el.classList.remove( 'is-sung' );
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
