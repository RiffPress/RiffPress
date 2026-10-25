/**
 * A steel string's sound: the Karplus-Strong model of a plucked string, made a steel string's. A
 * delay line one period long holds the string's shape; each pass round it is averaged a little
 * (the string losing its highs) and damped (the note dying away). Over the plain model:
 *
 * - it is in tune: a first-order allpass in the loop supplies the fraction of a sample the period
 *   needs, which rounding would leave sharp or flat by up to a quarter of a semitone;
 * - the pick's position shapes the tone: plucked near the bridge it is thin and bright, near the
 *   middle round, by the comb a pluck at that point makes;
 * - steel loses its highs slowly and rings long, wound strings longest; a muted string, under the
 *   fretting hand, gives a short dull thud.
 *
 * .github/scripts/steel.test.js checks the pitch and the decay.
 */

export function render( { rate, hz, seconds, at = 0.3, force = 1, wound = false, muted = false } ) {
	const period = rate / hz;
	// The averaging filter's delay, in samples: less averaging is brighter.
	const s = muted ? 0.5 : wound ? 0.42 : 0.36;
	const length = Math.max( 2, Math.floor( period - s - 0.15 ) );
	const delta = period - s - length; // What the allpass makes up, a fraction of a sample.
	const c = ( 1 - delta ) / ( 1 + delta );
	// Down 60 dB over the string's ring time, per pass round the loop.
	const t60 = muted ? 0.09 : wound ? 6.5 : 4.8;
	const loss = 10 ** ( -3 / ( t60 * hz ) );

	// The pluck: noise, softened less the harder it is plucked, through the comb of the pick's place.
	const line = new Float32Array( length );
	let soft = 0;
	const bright = 0.55 + 0.4 * Math.min( 1, force );
	for ( let i = 0; i < length; i++ ) {
		soft = soft + bright * ( Math.random() * 2 - 1 - soft );
		line[ i ] = soft;
	}
	const place = Math.max( 1, Math.round( Math.min( at, 1 - at ) * length ) );
	// Round the whole loop, so the comb's notches fall exactly on the harmonics the place cancels.
	const picked = Float32Array.from( line, ( v, i ) => v - line[ ( i - place + length ) % length ] );
	line.set( picked );

	const out = new Float32Array( Math.round( rate * seconds ) );
	let i = 0;
	let was = 0;
	let apIn = 0;
	let apOut = 0;
	let peak = 0;
	for ( let n = 0; n < out.length; n++ ) {
		const x = line[ i ];
		out[ n ] = x;
		peak = Math.max( peak, Math.abs( x ) );
		const averaged = ( 1 - s ) * x + s * was;
		was = x;
		const tuned = c * averaged + apIn - c * apOut;
		apIn = averaged;
		apOut = tuned;
		line[ i ] = tuned * loss;
		i = ( i + 1 ) % length;
	}
	if ( peak > 0 ) {
		const k = ( muted ? 0.5 : 1 ) * Math.min( 1, force ) / peak;
		for ( let n = 0; n < out.length; n++ ) {
			out[ n ] *= k;
		}
	}
	return out;
}
