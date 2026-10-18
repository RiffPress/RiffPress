/* Riff Lyrics: fills the Lyrics tab beside Up next with the lyrics WordPress keeps on the track's
 * file, from the media REST route. It listens to the player's riff:tab and riff:track events, which
 * Riff dispatches on its own element for any script, so it needs nothing loaded before it. */
( () => {
	const config = window.riffLyrics || {};
	const cache = new Map();
	let showing = false;
	let turn = 0; // So a slow answer for an earlier track cannot replace the current one's.

	const panel = () => document.querySelector( '[data-riff-panel="lyrics"]' );

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
				headers: { Accept: 'application/json' },
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

	function say( where, text, className ) {
		const p = document.createElement( 'p' );
		p.className = className;
		p.textContent = text;
		where.replaceChildren( p );
	}

	async function fill( where, track ) {
		if ( ! where ) {
			return;
		}
		const mine = ++turn;
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
				say( where, text, 'riff-lyrics' );
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
} )();
