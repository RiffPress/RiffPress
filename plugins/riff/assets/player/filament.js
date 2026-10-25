/* The filament. The played part of the bar's seek line is a wire with current in it. The script
 * keeps one number, its heat, and writes it to --riff-heat on the lines once a frame; the stylesheet
 * turns that into the opacity of each fixed-colour layer of its light, which the GPU composites
 * without painting anything again. The heat follows a filament's physics: the signal's power drives
 * it up in about 80 ms, and with the current cut it cools the way a hot thing does, fast while it is
 * bright, then slowly through a long red tail. What counts as full power is whatever the track has
 * been reaching lately, so a quiet recording and a loud mix each light the whole wire. Where there
 * is no analyser (iOS, a file from another origin) the wire breathes at working temperature
 * instead. Loaded on demand, when the first track does. */

export default function filament( P ) {
	const { root, $, $$, audio, own } = P;
	const wire = $( '[data-riff-wire]' );
	const heart = $( '[data-riff-hot]' );
	const isIOS =
		/iP(hone|ad|od)/.test( navigator.userAgent ) ||
		( navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1 );
	P.analyser = null;
	let samples = null;
	let bins = null;
	let meterRaf = 0;
	let breath = null;
	let bars = [];
	let cooling = false;
	let lastTick = 0;
	// The wire's state outlives a restart: a view swap or a row appearing never dips it, and the
	// reference never has to relearn the track.
	let heat = 0;
	let ref = 0.08;

	// Routing audio through Web Audio on iOS breaks lock-screen and background playback, so iPhones
	// keep the breath. A file from another origin cannot be analysed either; see foreign().
	function ensureAnalyser() {
		const t = P.track();
		if (
			P.analyser ||
			isIOS ||
			! window.AudioContext ||
			! t ||
			P.foreign( t )
		) {
			return;
		}
		try {
			const ctx = new AudioContext();
			const src = ctx.createMediaElementSource( audio );
			const analyser = ctx.createAnalyser();
			// A 1024-sample window is 20 ms at 48 kHz: long enough for a steady RMS, short enough
			// to catch a transient.
			analyser.fftSize = 1024;
			analyser.smoothingTimeConstant = 0.6;
			samples = new Float32Array( analyser.fftSize );
			bins = new Uint8Array( analyser.frequencyBinCount );
			src.connect( analyser );
			analyser.connect( ctx.destination );
			audio.addEventListener( 'play', () =>
				ctx.resume().catch( () => {} )
			);
			// Suspended while nothing plays: the graph stops pulling samples, and the filament's
			// cool-down reads silence, which is right.
			for ( const ev of [ 'pause', 'ended' ] ) {
				audio.addEventListener( ev, () =>
					ctx.suspend().catch( () => {} )
				);
			}
			ctx.resume().catch( () => {} );
			P.analyser = analyser;
		} catch {
			P.analyser = null;
		}
	}

	// The signal's level: RMS over the window, as a filament sees current.
	function level() {
		P.analyser.getFloatTimeDomainData( samples );
		let sum = 0;
		for ( let n = 0; n < samples.length; n++ ) {
			sum += samples[ n ] * samples[ n ];
		}
		return Math.sqrt( sum / samples.length );
	}

	// Three bands for the bars on the playing row: bass, the body of a voice, and the air above it.
	const BANDS = [
		[ 1, 4 ],
		[ 4, 22 ],
		[ 22, 110 ],
	];
	// Each band is read against its own recent range, the way the wire reads against its own
	// reference: bass carries the most energy in nearly any mix, so one scale for all three pins
	// the bass bar and leaves the treble low, a staircase that barely moves. The range's top
	// follows a hit at once and settles over three seconds; its floor drops at once and climbs over
	// one, so a quiet intro doesn't hold every bar at the top for long. Each bar spends its whole
	// height on the band's own swing. A bar then rises fast and falls slower,
	// as a meter does, so a hit reads as a hit.
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

	// One step of the wire's physics. drive is the current, 0 to a little over 1; dt is in seconds.
	// Heating chases the drive with a 120 ms time constant: a wire warms, it does not flash.
	// Cooling is radiation plus conduction: a heat⁴ term that empties it while it is bright, and a
	// slow linear term for the tail, so a loud passage settles in half a second and the last red
	// takes a couple of seconds.
	function advance( drive, dt ) {
		if ( drive > heat ) {
			heat += ( drive - heat ) * ( 1 - Math.exp( -dt / 0.12 ) );
		} else {
			const loss = heat / 0.8 + 2.2 * heat * heat * heat * heat;
			heat = Math.max( drive, heat - loss * dt );
		}
		heat = Math.min( 1.2, heat );
	}

	// The wire is seen, not measured: a square root lifts the quiet end into view, since speech
	// sits around a tenth of full scale and would otherwise read as unlit.
	// Written on the lines and the glow themselves, not the root: a property on the root restyles
	// every element in the player each frame, these three restyle three.
	const heated = $$( '.riff-line, .riff-np-glow' );
	function setHeat( h ) {
		const value = Math.sqrt( Math.min( 1, Math.max( 0, h ) ) ).toFixed( 3 );
		for ( const node of heated ) {
			node.style.setProperty( '--riff-heat', value );
		}
	}

	// The meter area: each frame's heat and bands go to Riff's own listeners (own.meter), the
	// wire's glow and the playing row's bars among them. levels is null while the wire cools.
	const hear = ( h, levels = null ) =>
		own.meter.forEach( ( fn ) => fn( { heat: h, levels } ) );
	own.meter.add( ( { heat: h } ) => setHeat( h ) );
	// Three bars per place the current track is shown: the row in the post and the item in Up
	// next. Each place's bars take the three bands in turn.
	own.meter.add( ( { levels } ) => {
		if ( ! levels ) {
			return;
		}
		bars.forEach( ( bar, k ) => {
			bar.style.transform = `scaleY(${ (
				0.15 +
				0.85 * levels[ k % levels.length ]
			).toFixed( 2 ) })`;
		} );
	} );

	const liveBars = () => [
		...document.querySelectorAll(
			'.riff-row[data-current] .riff-row-state i, .riff-queue-list [aria-current] .riff-row-state i'
		),
	];

	function tick( now = 0 ) {
		const dt = lastTick
			? Math.min( 0.1, ( now - lastTick ) / 1000 )
			: 0.016;
		lastTick = now;
		if ( cooling ) {
			advance( 0, dt );
			hear( heat );
			if ( heat > 0.004 ) {
				meterRaf = requestAnimationFrame( tick );
			} else {
				heat = 0;
				hear( 0 );
				meterRaf = 0;
				cooling = false;
			}
			return;
		}
		const rms = level();
		// The reference rises to a peak in about 150 ms and forgets it over six seconds: a surge
		// flashes past full for a moment, as it would, and the wire ranges itself to the material.
		ref +=
			( rms - ref ) * ( 1 - Math.exp( -dt / ( rms > ref ? 0.15 : 6 ) ) );
		advance( rms / Math.max( 0.02, ref ), dt );
		hear( heat, bandLevels( dt ) );
		meterRaf = requestAnimationFrame( tick );
	}

	// Cut the current: the loop keeps running with no drive until the wire is dark.
	function meterStop() {
		if ( ! meterRaf && ! breath ) {
			return;
		}
		breath?.cancel();
		breath = null;
		root.removeAttribute( 'data-live' );
		for ( const bar of bars ) {
			bar.style.transform = '';
		}
		bars = [];
		if ( P.reduce() ) {
			cancelAnimationFrame( meterRaf );
			meterRaf = 0;
			heat = 0;
			hear( 0 );
			return;
		}
		cooling = true;
		if ( ! meterRaf ) {
			lastTick = 0;
			meterRaf = requestAnimationFrame( tick );
		}
	}

	function meterStart() {
		cooling = false;
		if ( P.reduce() ) {
			cancelAnimationFrame( meterRaf );
			meterRaf = 0;
			hear( 0.25 );
			return;
		}
		ensureAnalyser();
		if ( ! P.analyser || P.el() !== audio || ! wire ) {
			cancelAnimationFrame( meterRaf );
			meterRaf = 0;
			heat = 0.5;
			hear( heat );
			breath = heart.animate(
				[ { opacity: 0 }, { opacity: 0.45 }, { opacity: 0 } ],
				{
					duration: 2600,
					iterations: Infinity,
					easing: 'ease-in-out',
				}
			);
			return;
		}
		root.dataset.live = '';
		bars = liveBars();
		if ( ! meterRaf ) {
			lastTick = 0;
			meterRaf = requestAnimationFrame( tick );
		}
	}

	// Called from paint(): the wire follows whatever is playing, and the bars follow the current row.
	function meterSync() {
		const t = P.track();
		if ( t && ! P.el().paused && ! document.hidden ) {
			if ( ( ! meterRaf || cooling ) && ! breath ) {
				meterStart();
			} else if ( meterRaf ) {
				bars = liveBars();
			}
		} else {
			meterStop();
		}
	}

	P.meterSync = meterSync;
	// Loaded while something may already be playing: the wire catches up at once.
	meterSync();
	return { meterSync };
}
