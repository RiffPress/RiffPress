/* The meter. The music passes through one AnalyserNode, which the three bars on the playing row are
 * read from, and which window.riff.analyser() hands to a plugin. Each frame it
 * reads three bands, bass, voice and air, and tells Riff's own listeners (own.meter); the bars are
 * one of them. Where there is no analyser (iOS, a file from another origin, less motion asked for)
 * the bars keep their keyframes. Loaded on demand, when the first track does. */

import { calm } from 'riff-player/helpers';

export default function meter( P ) {
	const { root, audio, own } = P;
	const isIOS =
		/iP(hone|ad|od)/.test( navigator.userAgent ) ||
		( navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 );
	P.analyser = null;
	let bins = null;
	let meterRaf = 0;
	// The loop is parked, not stopped, while no bar is in sight: see seen().
	let parked = false;
	// Started with nothing to read: the bars keep their keyframes until the music stops.
	let unread = false;
	let bars = [];
	let lastTick = 0;

	// Routing audio through Web Audio on iOS breaks lock-screen and background playback, so iPhones
	// have no analyser. A file from another origin cannot be analysed either; see foreign().
	function hearable() {
		const t = P.track();
		// Only once <audio> holds a file Web Audio may hear: its own origin's, or one loaded for
		// CORS. One from another origin loaded before that origin said yes would play as silence.
		const file = audio.currentSrc || audio.getAttribute( 'src' ) || '';
		const readable =
			! file ||
			new URL( file, location.href ).origin === location.origin ||
			audio.crossOrigin === 'anonymous';
		return (
			! P.analyser &&
			! isIOS &&
			!! window.AudioContext &&
			!! t &&
			! P.foreign( t ) &&
			readable
		);
	}
	// Making the AudioContext holds the page's thread while it opens the sound device, for 170 ms
	// on a Mac, and it comes as the first track starts, when Now Playing may be opening or a view
	// coming in: it waits until they have (calm()). Whether the music can be heard is asked again
	// then, as the track may have changed, and the meter catches up once it can.
	let making = false;
	// A browser that would not make one is not asked again.
	let failed = false;
	function ensureAnalyser() {
		if ( making || failed || ! hearable() ) {
			return;
		}
		making = true;
		calm( () => {
			making = false;
			if ( hearable() && ! P.reduce() ) {
				makeAnalyser();
				unread = false;
				meterSync();
			}
		} );
	}
	function makeAnalyser() {
		try {
			const ctx = new AudioContext();
			const src = ctx.createMediaElementSource( audio );
			const analyser = ctx.createAnalyser();
			// A 1024-sample window is 20 ms at 48 kHz: long enough for steady bands, short enough
			// to catch a transient.
			analyser.fftSize = 1024;
			analyser.smoothingTimeConstant = 0.6;
			bins = new Uint8Array( analyser.frequencyBinCount );
			src.connect( analyser );
			analyser.connect( ctx.destination );
			audio.addEventListener( 'play', () =>
				ctx.resume().catch( () => {} )
			);
			// Suspended while nothing plays: the graph stops pulling samples.
			for ( const ev of [ 'pause', 'ended' ] ) {
				audio.addEventListener( ev, () =>
					ctx.suspend().catch( () => {} )
				);
			}
			ctx.resume().catch( () => {} );
			P.analyser = analyser;
		} catch {
			P.analyser = null;
			failed = true;
		}
	}

	// Three bands for the bars on the playing row: bass, the body of a voice, and the air above it.
	const BANDS = [
		[ 1, 4 ],
		[ 4, 22 ],
		[ 22, 110 ],
	];
	// Each band is read against its own recent range: bass carries the most energy in nearly any
	// mix, so one scale for all three pins the bass bar and leaves the treble low, a staircase that
	// barely moves. The range's top follows a hit at once and settles over three seconds; its floor
	// drops at once and climbs over one, so a quiet intro doesn't hold every bar at the top for long.
	// Each bar spends its whole height on the band's own swing. A bar then rises fast and falls
	// slower, as a meter does, so a hit reads as a hit.
	const bands = BANDS.map( () => ( { lo: -1, hi: 0, shown: 0 } ) );
	const ease = ( from, to, dt, tau ) =>
		from + ( to - from ) * ( 1 - Math.exp( -dt / tau ) );
	function bandLevels( dt ) {
		P.analyser.getByteFrequencyData( bins );
		return BANDS.map( ( [ a, b ], k ) => {
			let sum = 0;
			for ( let n = a; n < b; n++ ) {
				sum += bins[ n ];
			}
			const v = sum / ( b - a ) / 255;
			const band = bands[ k ];
			if ( band.lo < 0 ) {
				band.lo = band.hi = v;
			}
			band.hi = ease( band.hi, v, dt, v > band.hi ? 0.03 : 3 );
			band.lo = ease( band.lo, v, dt, v < band.lo ? 0.03 : 1 );
			const at = Math.min(
				1,
				Math.max(
					0,
					( v - band.lo ) / Math.max( 0.06, band.hi - band.lo )
				)
			);
			band.shown = ease(
				band.shown,
				at,
				dt,
				at > band.shown ? 0.04 : 0.2
			);
			return band.shown;
		} );
	}

	// Each frame's bands go to Riff's own listeners (own.meter), the playing row's bars among them.
	const hear = ( levels ) => own.meter.forEach( ( fn ) => fn( { levels } ) );
	// Three bars per place the current track is shown: the row in the post and the item in Up
	// next. Each place's bars take the three bands in turn. Only the places on screen are written,
	// and only by a step the eye could see: each write restyles the bar and its neighbours. When no
	// place is in sight (the row scrolled away, Up next closed) the loop parks until one is. Hidden
	// is out of sight as well: a hidden element never intersects.
	const onScreen = new Set();
	const watch =
		'IntersectionObserver' in window
			? new IntersectionObserver( ( entries ) => {
				for ( const e of entries ) {
					onScreen[ e.isIntersecting ? 'add' : 'delete' ]( e.target );
				}
				wake();
			} )
			: null;
	let places = [];
	const seen = () => ! watch || onScreen.size > 0;
	function wake() {
		if ( parked && seen() ) {
			parked = false;
			lastTick = 0;
			meterRaf = requestAnimationFrame( tick );
		}
	}
	const looping = () => meterRaf || parked;
	own.meter.add( ( { levels } ) => {
		bars.forEach( ( bar, k ) => {
			if ( watch && ! onScreen.has( bar.parentNode ) ) {
				return;
			}
			const height = 0.15 + 0.85 * levels[ k % levels.length ];
			const scale = `scaleY(${ ( Math.round( height * 20 ) / 20 ).toFixed( 2 ) })`;
			// Unchanged, it is left alone: a write costs a restyle even when it says the same.
			if ( bar.style.transform !== scale ) {
				bar.style.transform = scale;
			}
		} );
	} );

	const liveBars = () => {
		const found = [
			...document.querySelectorAll(
				'.riff-row[data-current] .riff-row-state i, .riff-queue-list [aria-current] .riff-row-state i'
			),
		];
		const next = [ ...new Set( found.map( ( bar ) => bar.parentNode ) ) ];
		// Watched anew only when the places change, as each paint asks again.
		if ( watch && ( next.length !== places.length || next.some( ( place, k ) => place !== places[ k ] ) ) ) {
			for ( const place of places ) {
				watch.unobserve( place );
				onScreen.delete( place );
			}
			places = next;
			places.forEach( ( place ) => watch.observe( place ) );
		}
		return found;
	};

	function tick( now = 0 ) {
		const dt = lastTick
			? Math.min( 0.1, ( now - lastTick ) / 1000 )
			: 0.016;
		lastTick = now;
		// No bar in sight: the loop parks, and the observer wakes it.
		if ( ! seen() ) {
			meterRaf = 0;
			parked = true;
			return;
		}
		hear( bandLevels( dt ) );
		meterRaf = requestAnimationFrame( tick );
	}

	function meterStop() {
		unread = false;
		cancelAnimationFrame( meterRaf );
		meterRaf = 0;
		parked = false;
		root.removeAttribute( 'data-live' );
		for ( const bar of bars ) {
			bar.style.transform = '';
		}
		bars = [];
	}

	function meterStart() {
		if ( P.reduce() ) {
			unread = true;
			return;
		}
		ensureAnalyser();
		if ( ! P.analyser || P.el() !== audio ) {
			unread = true;
			return;
		}
		root.dataset.live = '';
		bars = rest( liveBars() );
		if ( ! meterRaf ) {
			parked = false;
			lastTick = 0;
			meterRaf = requestAnimationFrame( tick );
		}
	}

	// A new track's bars start from rest, each band's range from nothing: the last track's levels
	// are not this one's, and would flash on the new row before the new song is heard.
	let barsFor = null;
	function rest( next ) {
		for ( const bar of bars ) {
			bar.style.transform = '';
		}
		for ( const band of bands ) {
			Object.assign( band, { lo: -1, hi: 0, shown: 0 } );
		}
		for ( const bar of next ) {
			bar.style.transform = 'scaleY(0.15)';
		}
		return next;
	}

	// Called from paint(): the meter follows whatever is playing, and the bars follow the current row.
	function meterSync() {
		const t = P.track();
		if ( t && ! P.el().paused && ! P.away() ) {
			// A new track may be one the analyser can hear where the last was not (a file loaded
			// before its origin said it shares): it is tried again.
			if ( unread && barsFor !== t ) {
				unread = false;
			}
			if ( ! looping() && ! unread ) {
				meterStart();
			} else if ( looping() ) {
				bars = barsFor === t ? liveBars() : rest( liveBars() );
			}
			barsFor = t;
		} else {
			meterStop();
		}
	}

	// A file that could not be heard when it was first asked about (loaded before its origin said
	// it shares) may be one that can by the time it plays: asked again as it starts.
	audio.addEventListener( 'playing', () => {
		if ( unread && ! P.reduce() ) {
			unread = false;
			meterSync();
		}
	} );
	P.meterSync = meterSync;
	// Loaded while something may already be playing: the meter catches up at once.
	meterSync();
	return { meterSync };
}
