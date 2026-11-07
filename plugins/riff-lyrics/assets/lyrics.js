/* Riff Lyrics: a Lyrics view of Now Playing, registered on the server (riff_register_view()) as
 * Riff registers its own, filled with the lyrics WordPress keeps on the track's file, from the
 * media REST route. It follows the player's riff:view and riff:time events, which Riff dispatches
 * on its own element for any script. Timed lyrics follow the music, through timing.js, which Riff
 * Chords and Riff Sing share: the line being sung is marked and kept in view, and a tap on a line
 * seeks to it through window.riff.seek(). timing.js reads them too, so Riff Sing shows the same
 * words at the same times, in the formats players and taggers already write: LRC, with its
 * [offset:] tag and Enhanced LRC's <mm:ss.xx> word times, whose words light up as they are sung;
 * WebVTT, the web's own timed text; and an ID3 SYLT frame, which the plugin turns into LRC when the
 * file is uploaded. The lines are text, read as a list, so they are the song's transcript as they
 * stand (WCAG 1.2.1 and 1.2.2). */
( () => {
	const config = window.riffLyrics || {};
	const timing = window.riffTiming; // timing.js, loaded before it.
	const cache = new Map();
	let showing = false;
	let turn = 0; // So a slow answer for an earlier track cannot replace the current one's.
	let lines = []; // The synced lines showing, each { time, el }, in time order.
	let current = -1;
	// A wheel or a finger on the lyrics is the listener's scrolling, which the following gives way to.
	const scrolled = timing.scrolling(
		( target ) => lines.length && target.closest?.( '[data-riff-view="lyrics"]' )
	);

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

	// A queue of lines under a note: what the empty view shows, decoration beside its words.
	const ICON =
		'<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 10L20 10M15 15L20 15"/><path d="M11.25 16.5C11.25 18.0188 10.0188 19.25 8.5 19.25C6.98122 19.25 5.75 18.0188 5.75 16.5C5.75 14.9812 6.98122 13.75 8.5 13.75C10.0188 13.75 11.25 14.9812 11.25 16.5Z" fill="currentColor" stroke="none"/><path d="M8.5 19.25C10.0188 19.25 11.25 18.0188 11.25 16.5C11.25 14.9812 10.0188 13.75 8.5 13.75C6.98122 13.75 5.75 14.9812 5.75 16.5C5.75 18.0188 6.98122 19.25 8.5 19.25ZM8.5 19.25C11.4867 19.25 11.75 16.5 11.75 15.1379V7.99998C11.75 4.9108 14.4 5.00254 16 5.00233"/></svg>';

	// The view with no lyrics in it: its message in the middle, and for someone who can edit the
	// Media Library, the way to the track's Lyrics field.
	function say( where, text, className, id = 0 ) {
		const box = document.createElement( 'div' );
		box.className = 'riff-lyrics-empty';
		box.innerHTML = ICON;
		const p = document.createElement( 'p' );
		p.className = className;
		p.textContent = text;
		box.append( p );
		if ( id > 0 && config.edit ) {
			const add = document.createElement( 'a' );
			add.className = 'riff-lyrics-add';
			add.href = config.edit + id;
			add.textContent = config.add || '';
			box.append( add );
		}
		where.replaceChildren( box );
	}

	function show( where, text ) {
		lines = [];
		current = -1;
		const synced = timing.lyrics( text );
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
		follow( timing.now() );
	}

	// Marks the line whose time has come and keeps it in the middle of the view, unless the
	// listener has just scrolled the lyrics themselves.
	function follow( time ) {
		if ( ! lines.length ) {
			return;
		}
		const i = timing.at( lines, time );
		for ( const w of lines[ i ]?.words || [] ) {
			w.el.classList.toggle( 'is-sung', timing.due( w.time, time ) );
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
		if ( showing && ! scrolled() ) {
			timing.centre( lines[ i ].el );
		}
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
				say( where, config.none || '', 'riff-lyrics-note', Number( track.id ) );
			}
		} catch {
			if ( mine === turn ) {
				say( where, config.error || '', 'riff-lyrics-note' );
			}
		}
	}

	// The view, filled as it opens and again as the track changes while it is open.
	document.addEventListener( 'riff:view', ( e ) => {
		if ( e.detail?.id !== 'lyrics' ) {
			return;
		}
		showing = !! e.detail.open;
		if ( showing ) {
			fill( e.detail.view, e.detail.track );
		}
	} );
	// The Lyrics button only for a track the server marked as having words (riff_track).
	const fit = () => player()?.view( 'lyrics', { shown: ( track ) => !! track?.lyrics } );
	if ( player() ) {
		fit();
	} else {
		document.addEventListener( 'riff:ready', fit, { once: true } );
	}
	timing.listen( follow );
} )();
