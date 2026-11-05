/* Now Playing. A dialog over the page: the page goes inert, Escape and the browser's back close
 * it, and focus goes back where it was. It is the track on its own: Up next and the other panels
 * are their own things, opened beside it or over it (registry.js). Its background takes its colour
 * from the artwork, darkened so text stays legible. The record beside the cover is cut as an LP
 * is: a band of grooves for each of the album's tracks, as wide as the track is long. It turns at
 * 33⅓, faster or slower with the music's speed as a turntable's pitch would, and its tonearm
 * tracks the album from the outside in (the turntable's parts, under turntable/). */
import { average, hsl, largest } from 'riff-player/helpers';
import { vinyl } from 'riff-player/turntable/vinyl';
import { stylus } from 'riff-player/turntable/stylus';
import { room } from 'riff-player/turntable/room';
import { motor } from 'riff-player/turntable/motor';
import { speeds } from 'riff-player/turntable/speeds';

export function nowPlaying( P ) {
	const { root, np, $ } = P;

	let opener = null;
	// The view showing: the album, the stage, until the listener opens another.
	P.showing = 'album';
	const screen = ( id ) => P.views?.get( id )?.place === 'screen';

	// A view in Now Playing's place: its region shown and the others hidden, or the stage for the
	// album, the record out on the deck where Now Playing is landscape and the cover on its own
	// where it is portrait (roomy()).
	function setView( id ) {
		if ( ! screen( id ) ) {
			return;
		}
		const was = P.showing;
		const shown = ! np.hidden;
		P.showing = id;
		root.dataset.riffShowing = id;
		const stage = !! P.views.get( id ).stage;
		np.dataset.riffScreen = stage ? 'stage' : 'own';
		for ( const [ other, v ] of P.views ) {
			if ( v.place === 'screen' && v.el ) {
				v.el.hidden = other !== id;
			}
		}
		T.roomy.last = undefined;
		clearTimeout( T.deck.opening );
		// Not a press of the listener's: changing the view doesn't stop following someone.
		T.retune( false );
		T.markRoom();
		T.deck( T.roomy() && ( 'riffTurning' in root.dataset || T.wholeDeck() ) );
		if ( shown && was !== id ) {
			P.viewOpened?.( was, false );
		}
		if ( shown ) {
			P.viewOpened?.( id, true );
			focusView();
		}
		P.drawControls?.();
	}

	// Focus into the view: its own region, or Now Playing's close button for the stage.
	function focusView() {
		const own = P.views?.get( P.showing );
		( own && ! own.stage && own.el ? own.el : $( '[data-riff-action="close"]' ) )?.focus( {
			preventScroll: true,
		} );
	}

	function open( id ) {
		if ( ! P.track() ) {
			return;
		}
		// Open, and not sliding away: the view changes in place.
		if ( ! np.hidden && root.classList.contains( 'is-open' ) ) {
			setView( screen( id ) ? id : 'album' );
			return;
		}
		const view = screen( id ) ? id : 'album';
		// Safari doesn't focus a button on click, so after a click the active element is the body;
		// focus then goes back to the view's button in the bar.
		const active = document.activeElement;
		opener =
			active && active !== document.body
				? active
				: $( `[data-riff-control="${ view }"]` ) || $( '.riff-bar-info' );
		setView( view );
		// Opened again while it slid away: it stays.
		clearTimeout( closing.timer );
		np.removeEventListener( 'transitionend', closing.done );
		closing.done = null;
		np.hidden = false;
		root.classList.add( 'is-open' );
		P.syncWakeLock?.();
		// Everything but the dialog is inert: the rest of the page, and on a phone the player's own
		// bar and toast, which the dialog covers there and which would otherwise still take focus.
		// On a wide screen the dialog opens above the bar and the bar stays the control surface,
		// unless it is a touch screen on its side, where Now Playing covers the bar as a phone's
		// does, the turntable or not (riff.css).
		coverPage();
		history.pushState( { ...history.state, riff: 'open' }, '' );
		P.viewOpened?.( view, true );
		P.drawControls?.();
		requestAnimationFrame( () => {
			np.classList.add( 'is-in' );
			focusView();
			if ( P.reduce() ) {
				hidePage();
			} else {
				np.addEventListener( 'transitionend', slidIn );
			}
		} );
	}

	// Once Now Playing has slid over the page, the page is neither styled nor painted. Each element
	// keeps its height, so the page's scroll position holds, and it is all back before Now Playing
	// slides away and focus returns to it.
	function slidIn( event ) {
		if ( event.target === np ) {
			np.removeEventListener( 'transitionend', slidIn );
			hidePage();
		}
	}

	function hidePage() {
		if ( np.hidden || ! np.classList.contains( 'is-in' ) ) {
			return;
		}
		const nodes = [ ...document.querySelectorAll( 'body > [data-riff-inert]' ) ];
		const heights = nodes.map( ( node ) => {
			const s = getComputedStyle( node );
			return (
				node.getBoundingClientRect().height -
				parseFloat( s.paddingTop ) -
				parseFloat( s.paddingBottom ) -
				parseFloat( s.borderTopWidth ) -
				parseFloat( s.borderBottomWidth )
			);
		} );
		nodes.forEach( ( node, i ) => {
			node.style.containIntrinsicHeight = `${ Math.max( 0, heights[ i ] ) }px`;
			node.dataset.riffCovered = '';
		} );
	}

	function showPage() {
		for ( const node of document.querySelectorAll( '[data-riff-covered]' ) ) {
			node.removeAttribute( 'data-riff-covered' );
			node.style.removeProperty( 'contain-intrinsic-height' );
		}
	}

	// Whether it covers the bar, as riff.css lays it out (--riff-np-covers), so the shapes are
	// written down once; asked again as the screen changes shape while it is open.
	function coverPage() {
		for ( const node of document.querySelectorAll( '[data-riff-inert]' ) ) {
			node.inert = false;
			node.removeAttribute( 'data-riff-inert' );
		}
		const wide =
			getComputedStyle( np ).getPropertyValue( '--riff-np-covers' ).trim() === '0';
		const covered = wide ? [] : [ $( '.riff-bar' ), $( '.riff-toast' ) ];
		// Modal only where it covers the bar: a screen reader keeps to a modal dialog, and on a wide
		// screen the bar beside it is still how the music is controlled.
		np.setAttribute( 'aria-modal', String( ! wide ) );
		for ( const node of [ ...document.body.children, ...covered ] ) {
			// The track menu is left alone, as the panels leave it: opened from the page before
			// anything played, it sits in the body, and it moves into Up next or Now Playing when
			// opened there, taking an inert set here with it.
			if (
				node &&
				node !== root &&
				! node.classList.contains( 'riff-menu' ) &&
				! node.id.startsWith( 'a11y-speak' ) &&
				! node.inert
			) {
				node.inert = true;
				node.dataset.riffInert = '';
			}
		}
	}
	window.addEventListener( 'resize', () => {
		if ( root.classList.contains( 'is-open' ) && ! P.panelOpen ) {
			coverPage();
		}
	} );

	// Now Playing sliding away: what hides it once it has, which opening it again cancels.
	const closing = { done: null, timer: 0 };
	function close( { fromHistory = false } = {} ) {
		// Closed, or already sliding away (the back button's popstate after a close of its own).
		if ( np.hidden || ! root.classList.contains( 'is-open' ) ) {
			return;
		}
		clearTimeout( closing.timer );
		np.removeEventListener( 'transitionend', closing.done );
		np.removeEventListener( 'transitionend', slidIn );
		showPage();
		np.classList.remove( 'is-in' );
		np.style.removeProperty( 'transform' );
		root.classList.remove( 'is-open' );
		for ( const node of document.querySelectorAll( '[data-riff-inert]' ) ) {
			node.inert = false;
			node.removeAttribute( 'data-riff-inert' );
		}
		P.viewOpened?.( P.showing, false );
		// Hidden once it has slid away, unless it was opened again first.
		const done = () => {
			clearTimeout( closing.timer );
			np.removeEventListener( 'transitionend', closing.done );
			closing.done = null;
			if ( ! root.classList.contains( 'is-open' ) ) {
				np.hidden = true;
				P.syncWakeLock?.();
			}
		};
		if ( P.reduce() ) {
			done();
		} else {
			closing.done = done;
			np.addEventListener( 'transitionend', done, { once: true } );
			closing.timer = setTimeout( done, 400 );
		}
		if ( ! fromHistory && history.state?.riff === 'open' ) {
			history.back();
		}
		// The button that opened it, or, hidden since (its view had nothing for the next track),
		// the button of the view showing.
		const back = [ opener, $( `[data-riff-control="${ P.showing }"]` ) ].find(
			( node ) => node && document.contains( node ) && ! node.hidden
		);
		back?.focus( { preventScroll: true } );
		P.drawControls?.();
	}

	window.addEventListener( 'popstate', () => {
		if ( ! np.hidden && history.state?.riff !== 'open' ) {
			close( { fromHistory: true } );
		}
	} );

	// ---- The background's colour, from the artwork, and the record's label printed on paper of
	// the cover's own colour, its average: dark words on a light colour, light on a dark one, so
	// they read on either. Only for the artwork still showing once it has been read.
	const LABEL = {
		'--riff-label-ink': [ '#141414', '#fff' ],
		'--riff-label-halo': [ 'rgb(255 255 255 / 0.4)', 'rgb(0 0 0 / 0.35)' ],
	};
	function tint( src ) {
		const clear = () => {
			for ( const name of [ '--riff-tint', '--riff-label-paper', ...Object.keys( LABEL ) ] ) {
				root.style.removeProperty( name );
			}
		};
		if ( ! src ) {
			clear();
			return;
		}
		average( src ).then( ( c ) => {
			if ( largest( P.track()?.art ) !== src && P.track()?.video?.poster !== src ) {
				return;
			}
			if ( ! c ) {
				clear();
				return;
			}
			const [ h, sat ] = hsl( c.r, c.g, c.b );
			root.style.setProperty(
				'--riff-tint',
				`hsl(${ Math.round( h ) } ${ Math.round( Math.min( sat, 0.55 ) * 100 ) }% 22%)`
			);
			root.style.setProperty(
				'--riff-label-paper',
				`rgb(${ Math.round( c.r ) } ${ Math.round( c.g ) } ${ Math.round( c.b ) })`
			);
			for ( const [ name, [ onLight, onDark ] ] of Object.entries( LABEL ) ) {
				root.style.setProperty( name, c.light ? onLight : onDark );
			}
		} );
	}

	// ---- The turntable, in its parts under turntable/: each a function of the player's state and
	// the turntable's own that adds its functions to the latter, as the player's sections add theirs
	// to the state, so a part calls another through it.
	const T = {
		// The albums' track lists, as pressed (press.js), and the one playing.
		albums: new Map(),
		playing: null,
		// The deck's speed, as chosen on its board (null: the record's own).
		chosen: null,
		// When the music last played to its end (stylus.js), and the platter's speed while it turns
		// with the music silent (motor.js).
		ended: 0,
		coasting: null,
		// Counts the starts and the sleeve's presses, so a start calls off the sleeve's putting the
		// record away once the music has stopped (room.js, motor.js).
		stowing: 0,
		// The arm's sweep across the side (stylus.js).
		sweep: null,
	};
	for ( const part of [ vinyl, stylus, room, motor, speeds ] ) {
		Object.assign( T, part( P, T ) );
	}

	const { groove, deck, turn, halt, held, stopping, respeed } = T;
	return { open, close, setView, tint, groove, deck, turn, halt, held, stopping, respeed };
}
