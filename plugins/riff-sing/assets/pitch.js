/* Riff Sing: which note is being sung, worked out in the browser from the microphone's samples.
 *
 * YIN (de Cheveigné and Kawahara, 2002): the difference between the sound and itself a period later
 * is smallest at the period, normalised so the first dip under a threshold is the fundamental rather
 * than one of its multiples. It is autocorrelation's close cousin, the method
 * .github/scripts/steel.test.js measures the site's strings with, and needs no service: nothing
 * leaves the device.
 *
 * The same file is the AudioWorklet that runs it. The page adds it to its AudioContext's worklet,
 * where registerProcessor() exists: it gathers the microphone's samples, halves their rate, which a
 * voice doesn't need, and posts the pitch about forty times a second. Node's tests require it and
 * read detect() from globalThis.riffSingPitch, where registerProcessor() doesn't exist. */
( ( scope ) => {
	/**
	 * The pitch of a stretch of sound.
	 *
	 * @param {Float32Array} samples           At least twice the longest period looked for.
	 * @param {number}       rate              Samples a second.
	 * @param {Object}       options           Options.
	 * @param {number}       options.low       Lowest pitch looked for, in Hz. Default 75.
	 * @param {number}       options.high      Highest, in Hz. Default 1100.
	 * @param {number}       options.threshold YIN's threshold. Default 0.15.
	 * @param {number}       options.quiet     Below this loudness (RMS) nothing is heard. Default 0.01.
	 * @return {{hz: number, clarity: number, rms: number}} hz is 0 when no pitch is heard.
	 */
	function detect( samples, rate, { low = 75, high = 1100, threshold = 0.15, quiet = 0.01 } = {} ) {
		const size = samples.length >> 1;
		let rms = 0;
		for ( let i = 0; i < samples.length; i++ ) {
			rms += samples[ i ] * samples[ i ];
		}
		rms = Math.sqrt( rms / samples.length );
		const none = { hz: 0, clarity: 0, rms };
		const min = Math.max( 2, Math.floor( rate / high ) );
		const max = Math.min( size - 1, Math.ceil( rate / low ) );
		if ( rms < quiet || max <= min ) {
			return none;
		}
		// The difference function, then each lag's share of the running mean of all before it.
		const d = new Float32Array( max + 2 );
		for ( let tau = 1; tau <= max + 1; tau++ ) {
			let sum = 0;
			for ( let i = 0; i < size; i++ ) {
				const delta = samples[ i ] - samples[ i + tau ];
				sum += delta * delta;
			}
			d[ tau ] = sum;
		}
		d[ 0 ] = 1;
		let running = 0;
		for ( let tau = 1; tau <= max + 1; tau++ ) {
			running += d[ tau ];
			d[ tau ] = running ? ( d[ tau ] * tau ) / running : 1;
		}
		// The first dip under the threshold, followed down to its lowest point.
		let tau = min;
		while ( tau <= max && d[ tau ] >= threshold ) {
			tau++;
		}
		if ( tau > max ) {
			return none;
		}
		while ( tau + 1 <= max && d[ tau + 1 ] < d[ tau ] ) {
			tau++;
		}
		// Between samples, by a parabola through the dip and its neighbours.
		const a = d[ tau - 1 ];
		const b = d[ tau ];
		const c = d[ tau + 1 ];
		const bend = a - 2 * b + c;
		const shift = bend > 0 ? ( a - c ) / ( 2 * bend ) : 0;
		return { hz: rate / ( tau + shift ), clarity: Math.max( 0, 1 - b ), rms };
	}

	scope.riffSingPitch = { detect };

	if ( typeof scope.registerProcessor !== 'function' || typeof scope.AudioWorkletProcessor !== 'function' ) {
		return;
	}

	// 2048 samples at half the device's rate: 85 ms at 48 kHz, two periods of the lowest voice.
	const SIZE = 2048;
	const HOP = 512;

	class Listener extends scope.AudioWorkletProcessor {
		constructor() {
			super();
			this.ring = new Float32Array( SIZE );
			this.window = new Float32Array( SIZE );
			this.at = 0;
			this.since = 0;
			this.odd = null;
			this.alive = true;
			this.port.onmessage = ( e ) => {
				if ( e.data === 'stop' ) {
					this.alive = false;
				}
			};
		}

		process( inputs ) {
			const input = inputs[ 0 ]?.[ 0 ];
			if ( input ) {
				// Halved: each pair of samples is averaged into one.
				for ( let i = 0; i < input.length; i++ ) {
					if ( this.odd === null ) {
						this.odd = input[ i ];
						continue;
					}
					this.ring[ this.at ] = ( this.odd + input[ i ] ) / 2;
					this.odd = null;
					this.at = ( this.at + 1 ) % SIZE;
					this.since++;
				}
				if ( this.since >= HOP ) {
					this.since = 0;
					this.window.set( this.ring.subarray( this.at ) );
					this.window.set( this.ring.subarray( 0, this.at ), SIZE - this.at );
					// eslint-disable-next-line no-undef -- sampleRate is the worklet scope's own global.
					const found = detect( this.window, sampleRate / 2 );
					this.port.postMessage( found );
				}
			}
			return this.alive;
		}
	}

	scope.registerProcessor( 'riff-sing-pitch', Listener );
} )( globalThis );
