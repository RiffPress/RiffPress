/* ---- The deck's own controls, where the whole screen is the turntable: the two speeds and the
 * pitch fader. The music plays at the speed chosen over the record's own (an LP at 45 runs
 * fast, as on a deck), times the pitch, ±8%; its pitch moves with it, as a record's does, and
 * the platter, the strobe and the arm follow the one rate (ratechange, motor.js). Anywhere else
 * the music plays at its own speed. */
const RPM = { 33: 100 / 3, 45: 45 };

export function speeds( P, T ) {
	const { root, $ } = P;

	// The pitch, in percent.
	let pitch = 0;
	const own = () => ( root.dataset.riffFormat === '7' ? '45' : '33' );
	function deckOnly() {
		if ( ! T.deckScreen() ) {
			return 1;
		}
		return ( RPM[ T.chosen ?? own() ] / RPM[ own() ] ) * ( 1 + pitch / 100 );
	}
	// The deck's speed times the listener's own (respeed(), motor.js).
	function deckRate() {
		return deckOnly() * P.speed;
	}
	const board = $( '.riff-deck-board' );
	const fader = $( '[data-riff-pitch]' );
	function paintDeck() {
		if ( ! board ) {
			return;
		}
		for ( const b of board.querySelectorAll( '[data-riff-speed]' ) ) {
			const on = b.dataset.riffSpeed === ( T.chosen ?? own() );
			b.setAttribute( 'aria-checked', String( on ) );
			b.tabIndex = on ? 0 : -1;
		}
		const readout = `${ pitch > 0 ? '+' : '' }${ pitch.toFixed( 1 ) }`;
		fader.value = String( pitch );
		fader.setAttribute( 'aria-valuetext', `${ readout }%` );
		board.querySelector( 'output' ).textContent = readout;
	}
	// The motor pulls the platter to the new speed while it turns; stopped, it starts there. A
	// listener's own turn of the speed or the pitch is a press; the deck coming or going as the
	// stage changes shape is not, so opening Now Playing doesn't stop following someone.
	function retune( pressed = true ) {
		if ( pressed ) {
			P.press( 'speed' );
		}
		paintDeck();
		const m = P.el();
		if ( m.paused || T.held() || P.ramping ) {
			m.defaultPlaybackRate = deckRate();
			return;
		}
		T.bend( m, deckRate() ).then( ( whole ) => whole && T.settle( m ) );
	}
	if ( board ) {
		board.addEventListener( 'click', ( e ) => {
			const speed = e.target.closest( '[data-riff-speed]' );
			if ( speed ) {
				T.chosen = speed.dataset.riffSpeed;
				retune();
			}
		} );
		// The speeds are a radio group: the arrows move between them.
		board.querySelector( '.riff-speeds' ).addEventListener( 'keydown', ( e ) => {
			if ( ! [ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown' ].includes( e.key ) ) {
				return;
			}
			e.preventDefault();
			T.chosen = ( T.chosen ?? own() ) === '33' ? '45' : '33';
			retune();
			board.querySelector( `[data-riff-speed="${ T.chosen }"]` ).focus();
		} );
		fader.addEventListener( 'input', () => {
			const v = Number( fader.value );
			// It clicks into the middle, as a fader's centre detent does.
			pitch = Math.abs( v ) < 0.3 ? 0 : v;
			retune();
		} );
		fader.addEventListener( 'dblclick', () => {
			pitch = 0;
			retune();
		} );
		paintDeck();
	}

	return { deckOnly, deckRate, retune };
}
