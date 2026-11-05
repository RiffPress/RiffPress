/* ---- Starting and stopping, as a turntable does where the record is seen: Now Playing open on
 * a song, with motion. To start, the record comes out of its sleeve if it is in it (after a new
 * album has come in), the needle drops, and only then does the platter start, the music with
 * it: the platter's speed is the music's, the pitch rising with it as a record's does, the
 * platter's turn and the arm's sweep following the same rate. To stop, it winds down, the pitch
 * falling, and then stops. Moving on to the next track, it keeps turning. Where the record is
 * not seen, the music starts and stops at once. The browser's own speed change does the bending
 * (preservesPitch off), on the element's own clock.
 *
 * The platter moves as a direct-drive deck's does. Its motor pulls with a constant torque, so
 * its speed rises at a constant rate, in a straight line: from rest to 33⅓ in 0.7 s. It brakes
 * with the same torque, from 33⅓ to rest in 0.7 s. A new speed or pitch while it turns is the
 * same pull, for as long as the change takes. The music is heard from a crawl up, as slow as
 * the player lets it go; below that the platter turns with the music silent (coast()). */
export const ARRIVE = 850;
export const DROP = 450;
// The hand's carry of the arm from its rest to the groove (swing()): the music waits until the
// stylus is in it.
const LAND = 600;
const CRAWL = 0.3;
// In revolutions a minute, each millisecond. Technics' SL-1200MK7 specification gives 0.7 s
// from standstill to 33⅓ (build-up characteristics) on 0.18 N·m of starting torque. Its brake is
// electronic, the motor itself pulling against the turn, and no stopping time is published, so
// it is taken at the motor's own torque: 33⅓ to rest in the same 0.7 s.
const TORQUE = 100 / 3 / 700;
const BRAKE = TORQUE;
// How long the cue lever takes to lower the arm onto the record: its silicone damping lets the
// arm sink at one even speed, 8 mm a second, from 4 mm up, as a weight sinks through oil once it
// has reached the speed the oil allows it, which takes it a millisecond. turntable.css draws it
// with the shadow under the arm coming in at that one speed.
const LOWER = ( 4 / 8 ) * 1000;

export function motor( P, T ) {
	const { root, np, $, $$ } = P;

	// ---- The strobe on the platter's rim, as the deck's lamp shows it (turntable.css): between two
	// of its flashes the platter turns some way, and a row of dots seems to move by only what is
	// left over after the whole dots, so each row turns by that alone, a turn a second for each 360°
	// a second it seems to drift. Still while the platter is.
	const FLASHES = 120;
	function strobe() {
		const m = P.el();
		const turning = ( 'riffTurning' in root.dataset || T.coasting !== null ) && root.dataset.riffDeck === 'out' && ! P.reduce();
		const rpm = root.dataset.riffFormat === '7' ? 45 : 100 / 3;
		const step = turning ? ( ( rpm / 60 ) * 360 * ( T.coasting ?? ( m.playbackRate || 1 ) ) ) / FLASHES : 0;
		// The rows' dots, round, at their radii on the rim, the platter's radius 100: drawn once, the
		// two together where the room lights them, and each on its own in the lamp's patch.
		const ROWS = [ [ 216, 95.7 ], [ 160, 97.9 ] ];
		const dots = ( rows ) => {
			let circles = '';
			for ( const [ count, radius ] of rows ) {
				for ( let n = 0; n < count; n++ ) {
					const a = ( n * 2 * Math.PI ) / count;
					circles += `<circle cx="${ ( radius * Math.cos( a ) ).toFixed( 2 ) }" cy="${ ( radius * Math.sin( a ) ).toFixed( 2 ) }" r="0.62"/>`;
				}
			}
			return `<svg viewBox="-100 -100 200 200" focusable="false">${ circles }</svg>`;
		};
		const room = $( '.riff-strobe-room i' );
		if ( room && ! room.firstChild ) {
			room.innerHTML = dots( ROWS );
		}
		$$( '.riff-strobe-lamp i' ).forEach( ( row, k ) => {
			if ( ! row.firstChild ) {
				row.innerHTML = dots( [ ROWS[ k ] ] );
			}
			const dot = 360 / ROWS[ k ][ 0 ];
			const seen = step - dot * Math.round( step / dot );
			if ( ! row.drift ) {
				row.drift = row.animate( [ { rotate: '0deg' }, { rotate: '360deg' } ], { duration: 1000, iterations: Infinity } );
				// Far into its turns, so it can run backwards as long as it needs to: run back from its
				// start, an animation stops there.
				row.drift.currentTime = 1e9;
			}
			row.drift.updatePlaybackRate( ( seen * FLASHES ) / 360 );
		} );
	}

	// How long the platter takes from one rate to another, the rates as shares of the record's own
	// speed.
	const pull = ( from, to ) =>
		( Math.abs( to - from ) * ( root.dataset.riffFormat === '7' ? 45 : 100 / 3 ) ) / ( to > from ? TORQUE : BRAKE );
	let ramping = 0;
	// Whether the track shows as its video is the track's (P.isVideo()), not P.mode: that is the
	// listener's choice for a track that has a video, and is 'video' until they choose the song, so
	// it would say every song in such a session was a picture and start and stop it at once.
	const seen = () =>
		! np.hidden && ! P.away() && ! P.reduce() && ! P.isVideo() && T.roomy();
	function bend( m, to ) {
		const from = m.playbackRate || 1;
		const ms = pull( from, to );
		const id = ++ramping;
		P.ramping = true;
		m.preservesPitch = m.webkitPreservesPitch = false;
		return new Promise( ( done ) => {
			const t0 = performance.now();
			const step = ( now ) => {
				if ( id !== ramping ) {
					return done( false );
				}
				// A page put out of sight stops drawing frames, which would leave the music at whatever
				// speed it had reached: out of sight, the pull is over at once.
				const k = ms && ! document.hidden ? Math.min( 1, ( now - t0 ) / ms ) : 1;
				const rate = k < 1 ? from + ( to - from ) * k : to;
				m.playbackRate = rate;
				// The platter and the arm take the music's new speed in the same frame, not a frame
				// later on its ratechange.
				drive( rate );
				if ( k < 1 ) {
					requestAnimationFrame( step );
					return;
				}
				bend.finish = null;
				P.ramping = false;
				done( true );
			};
			bend.finish = () => step( performance.now() );
			// Out of sight already (play pressed, then the tab left while the arm came down), no
			// frame would come to start it: it is over at once.
			if ( document.hidden ) {
				bend.finish();
			} else {
				requestAnimationFrame( step );
			}
		} );
	}
	document.addEventListener( 'visibilitychange', () => document.hidden && bend.finish?.() );
	// The platter's and the arm's rate, set where the music's is.
	function drive( rate ) {
		if ( T.coasting === null ) {
			platter( rate );
		}
		if ( T.sweep ) {
			rated( T.sweep, rate );
		}
	}
	// An animation's rate, set at once so it changes in the frame the music's does; while its play
	// is still pending, setting it would hold it there, so it waits for that.
	function rated( a, rate ) {
		if ( a.pending ) {
			a.updatePlaybackRate( rate );
		} else if ( a.playbackRate !== rate ) {
			a.playbackRate = rate;
		}
	}
	function settle( m ) {
		ramping++;
		P.ramping = false;
		const to = T.deckRate();
		m.playbackRate = m.defaultPlaybackRate = to;
		// The deck's speed moves the pitch, as a record's does; the listener's own keeps it.
		m.preservesPitch = m.webkitPreservesPitch = T.deckOnly() === 1;
	}
	// The listener's own speed, from window.riff.speed(): set on both elements, so it holds when
	// the song hands over to its video and for every track after. While the platter is being
	// pulled up to speed or wound down, the music settles at the new speed once it gets there.
	function respeed( rate ) {
		P.speed = rate;
		const m = P.el();
		for ( const other of [ P.audio, P.video ] ) {
			if ( other !== m ) {
				other.playbackRate = other.defaultPlaybackRate = T.deckRate();
				other.preservesPitch = other.webkitPreservesPitch = T.deckOnly() === 1;
			}
		}
		if ( ! P.ramping ) {
			settle( m );
		}
	}

	// The platter's speed while it turns with the music silent: coming up to a crawl before the
	// music starts, or on down to rest after it has stopped. Its turn and the strobe follow this
	// rate in place of the music's (platter()); null while they follow the music.
	let coasts = 0;
	function platter( rate ) {
		for ( const turns of $$( '.riff-turns' ) ) {
			for ( const a of turns.getAnimations() ) {
				rated( a, rate );
			}
		}
		strobe();
	}
	function coast( from, to, then ) {
		const id = ++coasts;
		const ms = pull( from, to );
		const t0 = performance.now();
		T.coasting = from;
		root.dataset.riffCoasting = '';
		const step = ( now ) => {
			if ( id !== coasts ) {
				return;
			}
			const k = ms ? Math.min( 1, ( now - t0 ) / ms ) : 1;
			T.coasting = from + ( to - from ) * k;
			platter( T.coasting );
			if ( k < 1 ) {
				requestAnimationFrame( step );
			} else if ( ! to ) {
				release();
				then?.();
			}
		};
		requestAnimationFrame( step );
	}
	// The music has the platter again, or the platter has come to rest.
	function release() {
		coasts++;
		T.coasting = null;
		delete root.dataset.riffCoasting;
		platter( P.el().playbackRate || 1 );
	}
	const windDown = () => T.coasting !== null && coast( T.coasting, 0 );

	function cued( on ) {
		root.toggleAttribute( 'data-riff-cued', on );
	}
	// The cue lever. Up, the stylus rides above its groove (data-riff-up=""); lowering, it sinks
	// onto it ("lowering"); down, the attribute is gone. It is raised only once the platter is at
	// rest, the music long silent, and the music is heard only once it is down again.
	const tonearmOf = () => $( '.riff-arm' );
	function raise() {
		const arm = tonearmOf();
		if ( arm && 'riffDown' in arm.dataset && P.el().paused && ! held() ) {
			arm.dataset.riffUp = '';
		}
	}
	function lowered() {
		delete tonearmOf()?.dataset.riffUp;
	}
	function turn( m ) {
		// A followed host's start is made by Listen Together, when it is due.
		if ( P.holds( m, true ) ) {
			return;
		}
		clearTimeout( turn.wait );
		clearTimeout( turn.spin );
		T.stowing++;
		// The stylus is in the run-out: the record is seen to once it has been lifted from there.
		if ( T.runout.until > performance.now() && seen() ) {
			cued( true );
			P.paint();
			turn.wait = setTimeout( () => turn( m ), T.runout.until - performance.now() + 20 );
			return;
		}
		const turning = root.dataset.playing === 'true' && root.dataset.riffDeck === 'out' && ! ( 'riffCued' in root.dataset );
		const flipping = T.flip.until > performance.now();
		// At the listener's own speed the music keeps its pitch, which a platter coming up to speed
		// would bend, so it starts at once.
		if ( ! seen() || P.speed !== 1 || ( turning && ! P.ramping && ! flipping ) ) {
			lowered();
			cued( false );
			if ( T.coasting !== null ) {
				release();
			}
			settle( m );
			m.play().catch( P.paint );
			return;
		}
		let wait = 0;
		const arm = tonearmOf();
		if (
			root.dataset.riffDeck === 'out' &&
			m.paused &&
			! flipping &&
			! ( 'riffArriving' in root.dataset ) &&
			arm?.dataset.riffUp !== undefined
		) {
			// The arm is up: the cue lever lowers it onto the record, and the platter starts once
			// the stylus is in the groove.
			arm.dataset.riffUp = 'lowering';
			wait = LOWER;
			clearTimeout( turn.land );
			turn.land = setTimeout( lowered, LOWER );
		} else if ( flipping ) {
			wait = T.flip.until - performance.now() + LAND;
		} else if ( 'riffArriving' in root.dataset ) {
			wait = Math.max( 0, T.change.until - performance.now() ) + DROP + LAND;
		} else if ( root.dataset.riffDeck !== 'out' ) {
			T.deck( true );
			wait = DROP + LAND;
		}
		cued( true );
		P.paint();
		const start = () => {
			cued( false );
			if ( P.el() !== m ) {
				windDown();
				return;
			}
			lowered();
			const from = m.paused ? CRAWL : m.playbackRate;
			m.playbackRate = from;
			m.preservesPitch = m.webkitPreservesPitch = false;
			m.play()
				.then( () => bend( m, T.deckRate() ) )
				.then( ( whole ) => whole && settle( m ) )
				.catch( () => {
					// Unless another start has the platter by now.
					if ( ! held() ) {
						windDown();
					}
					P.paint();
				} );
		};
		if ( m.paused ) {
			// From rest, the motor starts once the stylus is in the groove, pulling the platter up
			// to a crawl in silence, and the music starts there, at the speed the platter has
			// reached, its pitch rising with it. Still turning as it winds down, the stylus still in
			// its groove, it is pulled up from where it is, at once, unless the record is being
			// turned over or changed meanwhile.
			const up = pull( T.coasting ?? 0, CRAWL );
			if ( T.coasting !== null && ! flipping && ! ( 'riffArriving' in root.dataset ) ) {
				coast( T.coasting, CRAWL );
				wait = Math.max( wait, up );
			} else {
				turn.spin = setTimeout( () => coast( T.coasting ?? 0, CRAWL ), wait );
				wait += up;
			}
		}
		if ( wait ) {
			turn.wait = setTimeout( start, wait );
		} else {
			start();
		}
	}
	function halt( m ) {
		// A followed host's stop is made by Listen Together, when it is due.
		if ( P.holds( m, false ) ) {
			return;
		}
		clearTimeout( turn.wait );
		clearTimeout( turn.spin );
		clearTimeout( turn.land );
		if ( 'riffCued' in root.dataset ) {
			cued( false );
			if ( T.coasting !== null ) {
				coast( T.coasting, 0, raise );
			} else {
				raise();
			}
			P.paint();
			return;
		}
		if ( ! seen() || m.paused || P.speed !== 1 ) {
			settle( m );
			m.pause();
			raise();
			return;
		}
		halt.going = m;
		bend( m, CRAWL ).then( ( whole ) => {
			halt.going = null;
			if ( whole ) {
				m.pause();
				settle( m );
				// The music stops at a crawl, and the platter turns on down to rest; only then
				// does the cue lever lift the stylus out of the groove.
				coast( CRAWL, 0, raise );
			}
		} );
		P.paint();
	}
	// Whether play has been pressed and the music is waiting on the needle, or is winding down: the
	// controls show what was asked for.
	const held = () => 'riffCued' in root.dataset;
	const stopping = () => !! halt.going && P.ramping;

	// ---- Out of the sleeve once the album plays, and not while a new one is arriving; it stays
	// out when paused. The arm follows the music wherever it goes, and the platter its speed: 33⅓
	// at the music's own, faster or slower with it, as a turntable's pitch changes both, one rate
	// set on the animation, which keeps it on the compositor.
	for ( const el of [ P.audio, P.video ] ) {
		el.addEventListener( 'playing', () => {
			if ( el === P.el() ) {
				root.dataset.riffTurning = '';
				release();
			}
			if ( ! ( 'riffArriving' in root.dataset ) ) {
				T.deck( true );
			}
		} );
		el.addEventListener( 'pause', () => {
			if ( el === P.el() ) {
				delete root.dataset.riffTurning;
				strobe();
			}
		} );
		el.addEventListener( 'ratechange', () => {
			if ( T.coasting === null ) {
				platter( el.playbackRate || 1 );
			}
		} );
		for ( const type of [ 'timeupdate', 'pause', 'playing', 'seeked', 'ratechange' ] ) {
			el.addEventListener( type, () => T.needle() );
		}
	}

	return { strobe, seen, bend, settle, respeed, platter, coast, windDown, turn, halt, held, stopping };
}
