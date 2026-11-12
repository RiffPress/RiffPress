/* The deck's display, in the window beside its keys, as a deck's or a tape machine's has one: the
 * band the stylus is in and the time into its track, the speed the platter turns at, and under
 * them the level: a row of lamps from -48 dB to full scale, lit as far as the music is loud (its
 * RMS over 300 ms, as a VU meter's needle averages it), with one lamp further on at its peak, held
 * a second and a half and then let fall, as a peak programme meter holds it, over a scale in
 * decibels. All of it is the one amber, but the last six decibels, which are red, as on every
 * meter. The level is read from the same analyser the playing row's bars are (meter.js); where the
 * music can't be heard that way (an iPhone, a file from another origin) and while nothing plays,
 * the lamps are dark and the display says the rest. Drawn at most thirty times a second, and only
 * while the deck is in sight. Loaded on demand, with the turntable. */
import { time } from 'riff-player/helpers';

export default function level( P ) {
	const { root, np, $ } = P;
	const canvas = $( '.riff-level' );
	const ink = canvas?.getContext( '2d' );
	if ( ! ink ) {
		return null;
	}
	const FLOOR = -48;
	const HOLD = 1500;
	const FALL = 20;
	let samples = null;
	let square = 0;
	let peak = FLOOR;
	let held = 0;
	let then = 0;
	let raf = 0;
	let look = null;
	const seen = () => canvas.offsetParent !== null && root.dataset.riffDeck === 'out' && ! np.hidden && ! P.away();
	const decibels = ( power ) => Math.max( FLOOR, 10 * Math.log10( Math.max( power, 1e-12 ) ) );
	const LAMPS = 40;
	// A lit lamp, drawn once at its size and in its colour with the faint bloom it throws on the
	// glass, and then only copied, so the glow costs nothing per frame.
	let lit = {};
	function lamp( color, wide, tall ) {
		const key = `${ color } ${ wide } ${ tall }`;
		if ( ! lit[ key ] ) {
			const glow = Math.max( 2, Math.round( tall * 0.8 ) );
			const sprite = document.createElement( 'canvas' );
			sprite.width = wide + 2 * glow;
			sprite.height = tall + 2 * glow;
			const pen = sprite.getContext( '2d' );
			pen.fillStyle = pen.shadowColor = color;
			pen.shadowBlur = glow;
			pen.globalAlpha = 0.4;
			pen.fillRect( glow, glow, wide, tall );
			pen.shadowBlur = 0;
			pen.globalAlpha = 0.95;
			pen.fillRect( glow, glow, wide, tall );
			lit[ key ] = { sprite, glow };
		}
		return lit[ key ];
	}
	function draw( loud, top ) {
		const ratio = Math.min( 2, window.devicePixelRatio || 1 );
		const w = Math.round( canvas.clientWidth * ratio );
		const h = Math.round( canvas.clientHeight * ratio );
		if ( ! w || ! h ) {
			return;
		}
		if ( canvas.width !== w || canvas.height !== h ) {
			canvas.width = w;
			canvas.height = h;
			lit = {};
		}
		// Its ink and its type, looked up once a second rather than at every frame.
		if ( ! look || performance.now() - look.at > 1000 ) {
			const computed = getComputedStyle( canvas );
			look = { at: performance.now(), color: computed.color, fontFamily: computed.fontFamily };
		}
		const style = look;
		const HOT = '#ff5a3c';
		const edge = h * 0.2;
		const wide = ( w - 2 * edge ) / LAMPS;
		const at = ( db ) => edge + ( ( db - FLOOR ) / -FLOOR ) * ( w - 2 * edge );
		const lampWide = Math.max( 1, Math.round( wide * 0.62 ) );
		const lampTall = Math.round( h * 0.19 );
		ink.clearRect( 0, 0, w, h );
		for ( let n = 0; n < LAMPS; n++ ) {
			// The level a lamp stands for: the top of its own step.
			const db = FLOOR + ( ( n + 1 ) * -FLOOR ) / LAMPS;
			const on = db <= loud || ( top > FLOOR && Math.abs( db - top ) <= -FLOOR / LAMPS / 2 );
			const color = db > -6 ? HOT : style.color;
			const x = Math.round( edge + n * wide );
			const y = Math.round( h * 0.5 );
			if ( on ) {
				const { sprite, glow } = lamp( color, lampWide, lampTall );
				ink.drawImage( sprite, x - glow, y - glow );
				continue;
			}
			ink.fillStyle = color;
			ink.globalAlpha = 0.1;
			ink.fillRect( x, y, lampWide, lampTall );
			ink.globalAlpha = 1;
		}
		ink.fillStyle = style.color;
		// The scale, dimmer than the readings and still easily read on the glass.
		ink.globalAlpha = 0.62;
		ink.font = `${ Math.round( h * 0.15 ) }px ${ style.fontFamily }`;
		ink.textBaseline = 'top';
		ink.textAlign = 'center';
		for ( const db of [ -36, -24, -12 ] ) {
			ink.fillText( String( db ), at( db ), h * 0.76 );
		}
		ink.textAlign = 'right';
		ink.fillText( '0 dB', w - edge, h * 0.76 );
		// What the deck says: the band (as the arm's own slider names it), the time into its
		// track, and the speed chosen.
		const band = ( $( '.riff-arm' )?.getAttribute( 'aria-valuetext' ) || '' ).split( ' ' )[ 0 ];
		const speed = $( '.riff-keys [data-riff-speed][aria-checked="true"]' )?.dataset.riffSpeed === '45' ? '45' : '33⅓';
		ink.globalAlpha = 0.95;
		ink.font = `500 ${ Math.round( h * 0.25 ) }px ${ style.fontFamily }`;
		ink.textBaseline = 'middle';
		ink.textAlign = 'left';
		ink.fillText( band, edge, h * 0.27 );
		ink.textAlign = 'center';
		ink.fillText( P.track() ? time( P.el().currentTime || 0 ) : '', w / 2, h * 0.27 );
		ink.textAlign = 'right';
		ink.fillText( speed, w - edge, h * 0.27 );
		ink.globalAlpha = 1;
	}
	function frame( now ) {
		raf = 0;
		if ( ! seen() ) {
			return;
		}
		const playing = root.dataset.playing === 'true';
		if ( playing ) {
			raf = requestAnimationFrame( frame );
		}
		if ( now - then < 33 && playing ) {
			return;
		}
		const dt = Math.min( 0.25, ( now - then ) / 1000 );
		then = now;
		const t = P.track();
		const analyser = playing && P.analyser && t && P.el() === P.audio && ! P.foreign( t ) ? P.analyser : null;
		if ( ! analyser ) {
			P.loud = null;
			square = 0;
			peak = FLOOR;
			draw( FLOOR, FLOOR );
			return;
		}
		if ( ! samples || samples.length !== analyser.fftSize ) {
			samples = new Float32Array( analyser.fftSize );
		}
		analyser.getFloatTimeDomainData( samples );
		let sum = 0;
		let most = 0;
		for ( const v of samples ) {
			sum += v * v;
			most = Math.max( most, Math.abs( v ) );
		}
		square += ( sum / samples.length - square ) * ( 1 - Math.exp( -dt / 0.3 ) );
		const top = decibels( most * most );
		if ( top >= peak ) {
			peak = top;
			held = now;
		} else if ( now - held > HOLD ) {
			peak = Math.max( top, peak - FALL * dt );
		}
		// For the light in the groove under the stylus (deck-gl.js).
		P.loud = decibels( square );
		draw( P.loud, peak );
	}
	function wake() {
		if ( ! raf && seen() ) {
			raf = requestAnimationFrame( frame );
		}
	}
	new MutationObserver( wake ).observe( root, { attributes: true, attributeFilter: [ 'data-riff-deck', 'data-playing', 'data-riff-showing', 'data-mode' ] } );
	new MutationObserver( wake ).observe( np, { attributes: true, attributeFilter: [ 'hidden' ] } );
	document.addEventListener( 'visibilitychange', wake );
	// What it says changes while nothing plays too: a seek, another track, the other speed.
	for ( const m of [ P.audio, P.video ] ) {
		m?.addEventListener( 'seeked', wake );
	}
	root.addEventListener( 'riff:track', wake );
	$( '.riff-keys' )?.addEventListener( 'click', () => requestAnimationFrame( wake ) );
	wake();
	return { wake };
}
