/* Where the turntable stands: whether Now Playing has room for it, the record out of its sleeve or
 * back in it, and the sleeve that puts the record away. */
import { DROP } from 'riff-player/turntable/motor';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

export function room( P, T ) {
	const { root, np, $ } = P;

	// The album is the cover on its own where Now Playing is portrait, as on a phone held upright,
	// and the turntable where it is landscape, as on a phone on its side or a computer's window.
	// turntable.css's container query on Now Playing says which (--riff-deck), so the two never
	// disagree; while Now Playing is closed it has no size, so the last answer holds, and before it
	// has ever opened the window's shape stands in, so music playing on a computer already has its
	// record out when Now Playing first opens. Turning the phone, unfolding it or resizing the
	// window brings the record out or puts it back. A site that turned the turntable off (Settings ›
	// Media), and a listener who asks for less motion, have the cover in every shape.
	const turntable = () =>
		P.showing === 'album' && P.data.turntable !== false && ! P.reduce();
	function roomy() {
		if ( ! turntable() ) {
			return false;
		}
		const cover = $( '.riff-cover' );
		if ( ! np.hidden && cover ) {
			roomy.last = getComputedStyle( cover ).getPropertyValue( '--riff-deck' ).trim() === '1';
		}
		return roomy.last ?? window.innerWidth > window.innerHeight;
	}
	// Where the turntable shows, the record comes out whether or not it is playing, as setting a
	// record on the platter does. Where the whole screen is the turntable (riff.css: an unfolded
	// phone, a phone on its side), the deck has its own controls too.
	const OPENING = 400;
	const wholeDeck = turntable;
	const shapedAsDeck = () =>
		!! $( '.riff-cover' ) &&
		getComputedStyle( $( '.riff-cover' ) ).getPropertyValue( '--riff-deck-screen' ).trim() === '1';
	const deckScreen = () => roomy() && shapedAsDeck();
	// For the stylesheet: off, the cover on its own, with no record, deck or meters.
	function markRoom() {
		if ( roomy() ) {
			delete root.dataset.riffTurntable;
		} else {
			root.dataset.riffTurntable = 'off';
		}
	}
	if ( $( '.riff-stage' ) && 'ResizeObserver' in window ) {
		const reroom = () => {
			// What the stylesheet was told, against what the shape and the listener ask for now.
			const was = ! ( 'riffTurntable' in root.dataset );
			const now = roomy();
			if ( np.hidden || now === was ) {
				return;
			}
			markRoom();
			clearTimeout( deck.opening );
			// Onto the deck its speed and pitch hold; off it the music is at its own speed again.
			T.retune( false );
			if ( now && ! P.el().paused && ! T.held() ) {
				deck( true );
				return;
			}
			if ( now ) {
				// Opened: the sleeve settles at the deck's edge first, then the record slides out of it.
				deck.opening = setTimeout( () => deck( roomy() ), OPENING );
				return;
			}
			deck( false );
		};
		new ResizeObserver( reroom ).observe( $( '.riff-stage' ) );
		// Asking for less motion puts the record away; asking for it again brings it out.
		window.matchMedia( '(prefers-reduced-motion: reduce)' ).addEventListener?.( 'change', reroom );
	}

	// The record out of its sleeve or back in it; out, the needle drops once it has come clear.
	function deck( out ) {
		const arm = $( '.riff-arm' );
		if ( ! out || ! roomy() ) {
			clearTimeout( deck.drop );
			T.stopRunout();
			delete root.dataset.riffDeck;
			delete arm?.dataset.riffDown;
			T.lift();
			T.strobe();
			stand( false );
			return;
		}
		// Already out, the needle is down or on its way: asked again before it lands (opening the
		// view as the music starts asks twice), the drop under way is the one that lands it.
		if ( root.dataset.riffDeck === 'out' ) {
			return;
		}
		// Shown while the music plays (Now Playing opened, the phone turned, the window widened), the
		// record is already on the platter at the music's speed and the stylus in the groove the music
		// is at, rather than set down and dropped onto under music already heard.
		if ( ! P.el().paused && ! T.held() && arm ) {
			root.dataset.riffAt = '';
			root.dataset.riffDeck = 'out';
			stand( true );
			arm.dataset.riffDown = '';
			// A carry back to the rest still under way, from the deck going away, is over.
			arm.querySelector( '.riff-arm-tube' )?.getAnimations().forEach( ( a ) => a.cancel() );
			T.needle( true );
			T.platter( P.el().playbackRate || 1 );
			requestAnimationFrame( () => requestAnimationFrame( () => delete root.dataset.riffAt ) );
			return;
		}
		root.dataset.riffDeck = 'out';
		stand( true );
		T.lay();
		T.needle();
		T.strobe();
		deck.drop = setTimeout( () => {
			if ( arm ) {
				arm.dataset.riffDown = '';
				T.needle();
			}
		}, P.reduce() ? 0 : DROP );
	}

	// ---- The parts at hand. Tapping the sleeve puts the record away, as a hand does: the arm back
	// on its rest, the platter wound down, the record into the sleeve. Tapped again, the record
	// comes out and plays. Pressing play anywhere does the same once it is away.
	const sleeve = $( '.riff-sleeve' );
	function stand( out ) {
		$( '.riff-mount' )?.toggleAttribute( 'inert', ! out );
		if ( sleeve ) {
			sleeve.textContent = out ? __( 'Put the record away' ) : __( 'Play the record' );
		}
	}
	function stow() {
		P.press( 'toggle' );
		const m = P.el();
		if ( root.dataset.riffDeck !== 'out' ) {
			T.turn( m );
			return;
		}
		const token = ++T.stowing;
		delete $( '.riff-arm' )?.dataset.riffDown;
		T.lift();
		const away = () => token === T.stowing && deck( false );
		if ( m.paused || T.held() ) {
			T.halt( m );
			away();
			return;
		}
		m.addEventListener( 'pause', away, { once: true } );
		T.halt( m );
	}
	sleeve?.addEventListener( 'click', stow );
	$( '.riff-cover' )?.addEventListener( 'click', () => {
		if ( sleeve?.checkVisibility() ) {
			stow();
		}
	} );

	return { roomy, wholeDeck, deckScreen, markRoom, deck };
}
