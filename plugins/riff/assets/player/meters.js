/* The turntable's meters: a VU meter and a spectrum under the deck, read from the music itself
 * where it passes through Web Audio (filament.js), as it does everywhere but an iPhone, and only
 * while the Turntable view shows. Nothing here is made up: no crackle, no wow, no flutter, and no
 * meter where nothing is measured. Neither is drawn for a listener who asks for less motion, or
 * where the turntable is turned off. Loaded by the filament where the music can pass through Web
 * Audio at all.
 *
 * The VU meter is the one IEC 60268-17 describes: a needle on a full-wave rectified signal, moving
 * as a damped movement does, reaching 99% of a steady tone's reading in 300 ms and passing it by
 * 1 to 1.5% before it settles. Here that movement is a second-order system, ζ = 0.813 for an
 * overshoot of 1.25% and ωn = 13.5 rad/s for the 300 ms, stepped once a sample over the samples
 * heard since the last frame. Its deflection is in proportion to the rectified voltage, as a
 * moving coil's is, so the scale's decibels crowd towards its right end, and +3 is full scale.
 * 0 VU is a sine at -14 dBFS, the loudness the streaming services play at, so music mastered for
 * them swings about 0. It reads the one channel the analyser hears, both sides of a stereo track
 * summed.
 *
 * The spectrum is a one-third-octave analyser's, 31 bands from 20 Hz to 20 kHz (ISO 266), each
 * band's power averaged with IEC 61672's Slow time weighting, one second, so it shows the shape of
 * the music rather than each beat. A lossy file shows where its encoder stopped: a 128 kbps MP3 has
 * nothing above about 16 kHz, and its top bands stay down.
 *
 * Its bars and the needle move by transform alone, written only when they move by a step the eye
 * could see. */

const __ = window.wp?.i18n?.__ || ( ( english ) => english );

// The needle's movement (IEC 60268-17).
const ZETA = 0.813;
const OMEGA = 13.5;
// 0 VU: the rectified mean of a sine at -14 dBFS, 2/π of its peak.
const REFERENCE = ( 2 / Math.PI ) * 10 ** ( -14 / 20 );
// Full scale is +3 VU, and the needle stops a little past it, at its peg.
const FULL = 10 ** ( 3 / 20 );
const PEG = 1.04;
// The scale's sweep either side of upright, in degrees.
const SWEEP = 45;
const MARKS = [ -20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3 ];

// One-third-octave bands: centres at 1 kHz × 2^(k/3), edges a sixth of an octave either side.
const BANDS = Array.from( { length: 31 }, ( _, k ) => 1000 * 2 ** ( ( k - 17 ) / 3 ) );
// The bars' scale, in dB of each band's power: the top about a full-scale sine's reading through
// the analyser's window, the floor below anything but silence and a lossy file's missing top.
const TOP = -20;
const FLOOR = -100;
// IEC 61672's Slow, in seconds.
const SLOW = 1;

// The scale's place for a level in VU, from 0 (at rest) to 1 (+3).
const deflection = ( vu ) => 10 ** ( vu / 20 ) / FULL;
const angle = ( at ) => -SWEEP + 2 * SWEEP * Math.min( PEG, Math.max( 0, at ) );

export default function meters( P ) {
	const { root, np, audio, $ } = P;
	const box = $( '.riff-meters' );
	if ( ! box ) {
		return null;
	}

	// ---- Drawn once: the dial, its scale and needle, and the spectrum's bars.
	const svg = 'http://www.w3.org/2000/svg';
	const dial = document.createElement( 'span' );
	dial.className = 'riff-vu';
	const face = document.createElementNS( svg, 'svg' );
	face.setAttribute( 'viewBox', '0 0 100 56' );
	face.setAttribute( 'focusable', 'false' );
	// The needle's pivot sits below the face, as a VU meter's does: (50, 66), the scale's arc
	// 52 from it.
	const PIVOT = 66;
	const ARC = 52;
	const point = ( deg, r ) => {
		const a = ( deg * Math.PI ) / 180;
		return [ 50 + r * Math.sin( a ), PIVOT - r * Math.cos( a ) ];
	};
	const arc = ( from, to, cls ) => {
		const [ x0, y0 ] = point( angle( deflection( from ) ), ARC );
		const [ x1, y1 ] = point( angle( deflection( to ) ), ARC );
		const path = document.createElementNS( svg, 'path' );
		path.setAttribute( 'd', `M${ x0.toFixed( 2 ) } ${ y0.toFixed( 2 ) }A${ ARC } ${ ARC } 0 0 1 ${ x1.toFixed( 2 ) } ${ y1.toFixed( 2 ) }` );
		path.setAttribute( 'class', cls );
		face.append( path );
	};
	arc( -20, 0, 'riff-vu-scale' );
	arc( 0, 3, 'riff-vu-over' );
	for ( const vu of MARKS ) {
		const deg = angle( deflection( vu ) );
		const [ x0, y0 ] = point( deg, ARC );
		const [ x1, y1 ] = point( deg, ARC + ( vu === 0 || vu === -20 || vu === 3 ? 6 : 3.5 ) );
		const tick = document.createElementNS( svg, 'line' );
		tick.setAttribute( 'x1', x0.toFixed( 2 ) );
		tick.setAttribute( 'y1', y0.toFixed( 2 ) );
		tick.setAttribute( 'x2', x1.toFixed( 2 ) );
		tick.setAttribute( 'y2', y1.toFixed( 2 ) );
		tick.setAttribute( 'class', vu > 0 ? 'riff-vu-over' : 'riff-vu-scale' );
		face.append( tick );
	}
	const name = document.createElementNS( svg, 'text' );
	name.setAttribute( 'x', '50' );
	name.setAttribute( 'y', '44' );
	name.textContent = 'VU';
	face.append( name );
	const needle = document.createElement( 'i' );
	needle.className = 'riff-vu-needle';
	dial.append( face, needle );

	const spectrum = document.createElement( 'span' );
	spectrum.className = 'riff-spectrum';
	const bars = BANDS.map( () => {
		const bar = document.createElement( 'i' );
		spectrum.append( bar );
		return bar;
	} );
	// Three frequencies along its foot, for finding where a file's top stops.
	for ( const [ k, text ] of [
		/* translators: 100 hertz, under the spectrum. */
		[ 7, __( '100', 'riff' ) ],
		/* translators: 1 kilohertz, under the spectrum. */
		[ 17, __( '1k', 'riff' ) ],
		/* translators: 10 kilohertz, under the spectrum. */
		[ 27, __( '10k', 'riff' ) ],
	] ) {
		const mark = document.createElement( 'small' );
		mark.textContent = text;
		mark.style.left = `${ ( ( 100 * ( k + 0.5 ) ) / BANDS.length ).toFixed( 2 ) }%`;
		spectrum.append( mark );
	}
	box.append( dial, spectrum );

	// ---- What the meters hear: a second analyser on the filament's, which passes the music on
	// unchanged. Its own, for a window long enough to part the lowest bands (8192 samples, under
	// 6 Hz a bin), with no smoothing of its own: the time weighting is the meters'.
	let tap = null;
	let samples = null;
	let spectra = null;
	let ranges = [];
	function listen() {
		if ( tap || ! P.analyser ) {
			return tap;
		}
		try {
			const ctx = P.analyser.context;
			tap = ctx.createAnalyser();
			tap.fftSize = 8192;
			tap.smoothingTimeConstant = 0;
			P.analyser.connect( tap );
			samples = new Float32Array( tap.fftSize );
			spectra = new Float32Array( tap.frequencyBinCount );
			// Each band's bins, by their centres; a band too narrow for any, the bin nearest it.
			const bin = ctx.sampleRate / tap.fftSize;
			ranges = BANDS.map( ( centre ) => {
				const from = Math.ceil( ( centre * 2 ** ( -1 / 6 ) ) / bin );
				const to = Math.min( spectra.length, Math.ceil( ( centre * 2 ** ( 1 / 6 ) ) / bin ) );
				const near = Math.min( spectra.length - 1, Math.round( centre / bin ) );
				return to > from ? [ from, to ] : [ near, near + 1 ];
			} );
		} catch {
			tap = null;
		}
		return tap;
	}

	// ---- The state each frame moves on: the needle's place and speed, and each band's power.
	let x = 0;
	let v = 0;
	let power = BANDS.map( () => 0 );
	let heardAt = null;
	let last = 0;
	let raf = 0;
	const shown = { needle: '', bars: bars.map( () => '' ) };

	// A new track is heard from nothing: the last one's spectrum is not this one's.
	function forget() {
		power = BANDS.map( () => 0 );
		heardAt = null;
	}
	audio.addEventListener( 'emptied', forget );

	// Whether the meters have their place: the Turntable view showing in Now Playing, the song
	// rather than its video, motion wanted, and music Web Audio can hear, or will once it plays.
	function placed() {
		const t = P.track();
		return (
			!! t &&
			! np.hidden &&
			P.showing === 'turntable' &&
			root.dataset.riffShowing === 'turntable' &&
			! ( 'riffTurntable' in root.dataset ) &&
			P.mode !== 'video' &&
			! P.reduce() &&
			P.el() === audio &&
			( !! P.analyser || ! P.foreign?.( t ) )
		);
	}

	function frame( now ) {
		raf = 0;
		if ( ! listen() || P.away() || ! ( 'riffMeters' in root.dataset ) ) {
			return;
		}
		const dt = last ? Math.min( 0.1, ( now - last ) / 1000 ) : 1 / 60;
		last = now;
		const ctx = tap.context;
		const playing = ! audio.paused && ctx.state === 'running';
		// The needle, stepped once a sample over what the context has played since the last frame;
		// paused, it falls back to its peg through silence, frame by frame.
		const rate = ctx.sampleRate;
		const step = ( u, h ) => {
			v += ( OMEGA * OMEGA * ( u - x ) - 2 * ZETA * OMEGA * v ) * h;
			x += v * h;
		};
		if ( playing ) {
			const fresh = heardAt === null ? Math.round( dt * rate ) : Math.round( ( ctx.currentTime - heardAt ) * rate );
			heardAt = ctx.currentTime;
			const n = Math.min( samples.length, Math.max( 0, fresh ) );
			if ( n ) {
				tap.getFloatTimeDomainData( samples );
				for ( let k = samples.length - n; k < samples.length; k++ ) {
					step( Math.abs( samples[ k ] ) / REFERENCE, 1 / rate );
				}
			}
		} else {
			heardAt = null;
			for ( let k = Math.ceil( dt * 1000 ); k > 0; k-- ) {
				step( 0, dt / Math.ceil( dt * 1000 ) );
			}
		}
		const deg = angle( x / FULL ).toFixed( 1 );
		if ( shown.needle !== deg ) {
			shown.needle = deg;
			needle.style.transform = `rotate(${ deg }deg)`;
		}

		// The bands: each one's power summed over its bins, then averaged over the Slow second.
		// Paused, there is nothing to hear, and the bars come down.
		const keep = Math.exp( -dt / SLOW );
		if ( playing ) {
			tap.getFloatFrequencyData( spectra );
		}
		let moving = Math.abs( v ) > 1e-4 || x > 1e-3;
		ranges.forEach( ( [ from, to ], k ) => {
			let sum = 0;
			if ( playing ) {
				for ( let n = from; n < to; n++ ) {
					const db = spectra[ n ];
					sum += Number.isFinite( db ) ? 10 ** ( db / 10 ) : 0;
				}
			}
			power[ k ] = power[ k ] * keep + sum * ( 1 - keep );
			const db = power[ k ] > 0 ? 10 * Math.log10( power[ k ] ) : -Infinity;
			const height = playing ? Math.min( 1, Math.max( 0, ( db - FLOOR ) / ( TOP - FLOOR ) ) ) : 0;
			const scale = ( Math.round( height * 40 ) / 40 ).toFixed( 3 );
			if ( shown.bars[ k ] !== scale ) {
				shown.bars[ k ] = scale;
				bars[ k ].style.transform = `scaleY(${ scale })`;
				moving = true;
			}
		} );
		if ( playing || moving ) {
			raf = requestAnimationFrame( frame );
		} else {
			last = 0;
		}
	}

	// Asked again whenever what decides it may have changed: the view, Now Playing, the song or
	// its video, the music starting and stopping, the motion asked for.
	function sync() {
		const place = placed();
		if ( place !== ( 'riffMeters' in root.dataset ) ) {
			if ( place ) {
				root.dataset.riffMeters = '';
			} else {
				delete root.dataset.riffMeters;
			}
		}
		// Drawn once something is measured; until the music first plays, the place is kept empty,
		// so the deck isn't moved when it does.
		box.toggleAttribute( 'data-riff-heard', place && listen() !== null );
		if ( place && tap && ! raf && ! P.away() ) {
			last = 0;
			raf = requestAnimationFrame( frame );
		}
		if ( ! place && raf ) {
			cancelAnimationFrame( raf );
			raf = 0;
			last = 0;
		}
	}
	let queued = false;
	const later = () => {
		if ( ! queued ) {
			queued = true;
			queueMicrotask( () => {
				queued = false;
				sync();
			} );
		}
	};
	new MutationObserver( later ).observe( root, {
		attributes: true,
		attributeFilter: [ 'data-riff-showing', 'data-riff-turntable', 'data-mode', 'data-playing', 'data-live', 'class' ],
	} );
	new MutationObserver( later ).observe( np, { attributes: true, attributeFilter: [ 'hidden' ] } );
	for ( const ev of [ 'play', 'playing', 'pause', 'emptied', 'loadstart' ] ) {
		audio.addEventListener( ev, later );
		P.video.addEventListener( ev, later );
	}
	document.addEventListener( 'visibilitychange', later );
	window.matchMedia( '(prefers-reduced-motion: reduce)' ).addEventListener?.( 'change', later );
	sync();
	return { sync };
}
