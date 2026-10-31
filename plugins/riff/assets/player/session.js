/* Lock screen, headphones, and the system's media controls, through the Media Session API. Loaded
 * on demand, when the first track does, and told about it once here. */

export default function session( P ) {
	function metadata( t ) {
		if ( ! ( 'mediaSession' in navigator ) || ! window.MediaMetadata ) {
			return;
		}
		navigator.mediaSession.metadata = new window.MediaMetadata( {
			title: t.title,
			artist: t.artist,
			album: t.album || t.post?.title || '',
			artwork: ( t.art || [] ).map( ( a ) => ( {
				src: a.src,
				sizes: a.sizes,
			} ) ),
		} );
	}

	let lastPosition = 0;
	function position() {
		const m = P.el();
		if (
			! navigator.mediaSession?.setPositionState ||
			! Number.isFinite( m.duration )
		) {
			return;
		}
		const now = performance.now();
		if ( now - lastPosition < 1000 ) {
			return;
		}
		lastPosition = now;
		try {
			navigator.mediaSession.setPositionState( {
				duration: m.duration,
				playbackRate: m.playbackRate || 1,
				position: Math.min( m.currentTime, m.duration ),
			} );
		} catch {
			// A position past the duration throws; the next tick corrects it.
		}
	}

	if ( 'mediaSession' in navigator ) {
		const actions = {
			play: () => ( P.press( 'play' ), P.turn( P.el() ) ),
			pause: () => ( P.press( 'pause' ), P.halt( P.el() ) ),
			previoustrack: () => ( P.press( 'prev' ), P.prev() ),
			nexttrack: () => ( P.press( 'next' ), P.next() ),
			seekbackward: ( d ) => {
				P.press( 'seek' );
				P.el().currentTime = Math.max(
					0,
					P.el().currentTime - ( d.seekOffset || 10 )
				);
			},
			seekforward: ( d ) => {
				P.press( 'seek' );
				P.el().currentTime =
					P.el().currentTime + ( d.seekOffset || 10 );
			},
			seekto: ( d ) => {
				P.press( 'seek' );
				if ( d.fastSeek && 'fastSeek' in P.el() ) {
					P.el().fastSeek( d.seekTime );
				} else {
					P.el().currentTime = d.seekTime;
				}
			},
			stop: () => P.dismiss(),
		};
		for ( const [ action, handler ] of Object.entries( actions ) ) {
			try {
				navigator.mediaSession.setActionHandler( action, handler );
			} catch {
				// Not every browser knows every action.
			}
		}
	}

	P.metadata = metadata;
	P.position = position;
	const t = P.track();
	if ( t ) {
		metadata( t );
	}
	return { metadata, position };
}
