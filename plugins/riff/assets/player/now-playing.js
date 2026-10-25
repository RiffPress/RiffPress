/* Now Playing. A dialog over the page: the page goes inert, Escape and the browser's back close
 * it, and focus goes back where it was. Up next on a phone is a handle peeking at the bottom, then
 * a split view with the art above the list, then the list on its own under a one-row player. The
 * tabs beside it are Up next and any a plugin adds through riff_now_playing_tabs. Its background
 * takes its colour from the artwork, darkened so text stays legible. */
import { hsl, largest } from 'riff-player/helpers';

export function nowPlaying( P ) {
	const { root, np, $, $$, queueList, emit } = P;

	let opener = null;
	function open() {
		if ( ! P.track() || ! np.hidden ) {
			return;
		}
		// Safari doesn't focus a button on click, so after a click the active element is the body;
		// focus then goes back to the bar's title, the control that opens Now Playing.
		opener =
			document.activeElement && document.activeElement !== document.body
				? document.activeElement
				: $( '.riff-bar-info' );
		np.hidden = false;
		root.classList.add( 'is-open' );
		P.syncWakeLock?.();
		// Everything but the dialog is inert: the rest of the page, and on a phone the player's own
		// bar and toast, which the dialog covers there and which would otherwise still take focus.
		// On a wide screen the dialog opens above the bar and the bar stays the control surface.
		const wide = window.matchMedia( '(min-width: 900px)' ).matches;
		const covered = wide ? [] : [ $( '.riff-bar' ), $( '.riff-toast' ) ];
		// Modal only where it covers the bar: a screen reader keeps to a modal dialog, and on a wide
		// screen the bar beside it is still how the music is controlled.
		np.setAttribute( 'aria-modal', String( ! wide ) );
		for ( const node of [ ...document.body.children, ...covered ] ) {
			if (
				node &&
				node !== root &&
				! node.id.startsWith( 'a11y-speak' ) &&
				! node.inert
			) {
				node.inert = true;
				node.dataset.riffInert = '';
			}
		}
		for ( const b of $$( '.riff-chevron' ) ) {
			b.setAttribute( 'aria-expanded', 'true' );
		}
		history.pushState( { ...history.state, riff: 'open' }, '' );
		requestAnimationFrame( () => {
			np.classList.add( 'is-in' );
			$( '[data-riff-action="close"]' ).focus( { preventScroll: true } );
		} );
	}

	function close( { fromHistory = false } = {} ) {
		if ( np.hidden ) {
			return;
		}
		np.classList.remove( 'is-in' );
		sheet( 'none' );
		np.style.removeProperty( 'transform' );
		root.classList.remove( 'is-open' );
		for ( const node of document.querySelectorAll( '[data-riff-inert]' ) ) {
			node.inert = false;
			node.removeAttribute( 'data-riff-inert' );
		}
		for ( const b of $$( '.riff-chevron' ) ) {
			b.setAttribute( 'aria-expanded', 'false' );
		}
		const done = () => {
			np.hidden = true;
			P.syncWakeLock?.();
		};
		if ( P.reduce() ) {
			done();
		} else {
			np.addEventListener( 'transitionend', done, { once: true } );
			setTimeout( done, 400 );
		}
		if ( ! fromHistory && history.state?.riff === 'open' ) {
			history.back();
		}
		if ( opener && document.contains( opener ) ) {
			opener.focus( { preventScroll: true } );
		}
	}

	window.addEventListener( 'popstate', () => {
		if ( ! np.hidden && history.state?.riff !== 'open' ) {
			close( { fromHistory: true } );
		}
	} );

	// ---- Up next on a phone. Tap the handle or drag it to move.
	P.sheetState = 'none';
	const peek = $( '.riff-peek' );
	function sheet( to ) {
		P.sheetState = to;
		np.dataset.sheet = to;
		peek.setAttribute( 'aria-expanded', String( to !== 'none' ) );
		if ( to !== 'none' ) {
			queueList
				.querySelector( '[aria-current]' )
				?.scrollIntoView( { block: 'nearest' } );
		}
	}

	// ---- Tabs beside Now Playing. Picking one shows its panel and fires riff.tab, so a plugin
	// fills its panel when it is seen. The keys follow the ARIA tabs pattern: arrows move and
	// pick, Home and End jump.
	const tabs = $$( '.riff-tab' );
	function pickTab( id, focus = false ) {
		const tab = tabs.find( ( t ) => t.dataset.riffTab === id );
		if ( ! tab ) {
			return;
		}
		for ( const t of tabs ) {
			t.setAttribute( 'aria-selected', String( t === tab ) );
			t.tabIndex = t === tab ? 0 : -1;
		}
		for ( const panel of $$( '[data-riff-panel]' ) ) {
			panel.hidden = panel.dataset.riffPanel !== id;
		}
		if ( focus ) {
			tab.focus();
		}
		/**
		 * Fires when a tab beside Now Playing is shown, including Up next. A plugin that added a
		 * tab fills its panel here, and again on `riff.track` while its tab is showing.
		 *
		 * @since 4.16.0
		 *
		 * @param {Object}      detail       What changed.
		 * @param {string}      detail.id    The tab's slug.
		 * @param {HTMLElement} detail.panel The tab's panel, `[data-riff-panel="<slug>"]`.
		 * @param {Object|null} detail.track The track playing.
		 * @param {Object}      api          `window.riff`.
		 */
		emit( 'tab', {
			id,
			panel: $( `[data-riff-panel="${ id }"]` ),
			track: P.track() || null,
		} );
	}
	// In Riff's desktop app Now Playing is Tidal's: the art on its own, and a tab opens its panel
	// beside it. Pressed again while its panel is open, the tab closes it.
	function drawer( tab ) {
		if ( ! document.documentElement.classList.contains( 'riff-desktop' ) ) {
			return true;
		}
		if (
			np.dataset.riffDrawer === 'open' &&
			tab.getAttribute( 'aria-selected' ) === 'true'
		) {
			delete np.dataset.riffDrawer;
			tab.setAttribute( 'aria-expanded', 'false' );
			return false;
		}
		np.dataset.riffDrawer = 'open';
		for ( const t of tabs ) {
			t.setAttribute( 'aria-expanded', String( t === tab ) );
		}
		return true;
	}
	for ( const t of tabs ) {
		t.addEventListener( 'click', () => {
			if ( drawer( t ) ) {
				pickTab( t.dataset.riffTab );
			}
		} );
		t.addEventListener( 'keydown', ( e ) => {
			const i = tabs.indexOf( t );
			const back = document.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
			const ahead = document.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
			const to = {
				[ back ]: ( i - 1 + tabs.length ) % tabs.length,
				[ ahead ]: ( i + 1 ) % tabs.length,
				Home: 0,
				End: tabs.length - 1,
			}[ e.key ];
			if ( to !== undefined ) {
				e.preventDefault();
				pickTab( tabs[ to ].dataset.riffTab, true );
			}
		} );
	}

	// ---- The background's colour, from the artwork.
	const tints = new Map();
	function tint( src ) {
		if ( ! src ) {
			root.style.removeProperty( '--riff-tint' );
			return;
		}
		if ( tints.has( src ) ) {
			root.style.setProperty( '--riff-tint', tints.get( src ) );
			return;
		}
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.decoding = 'async';
		img.onload = () => {
			try {
				const c = document.createElement( 'canvas' );
				c.width = c.height = 8;
				const ctx = c.getContext( '2d', { willReadFrequently: true } );
				ctx.drawImage( img, 0, 0, 8, 8 );
				const px = ctx.getImageData( 0, 0, 8, 8 ).data;
				let r = 0,
					g = 0,
					b = 0;
				for ( let i = 0; i < px.length; i += 4 ) {
					r += px[ i ];
					g += px[ i + 1 ];
					b += px[ i + 2 ];
				}
				const n = px.length / 4;
				const [ h, sat ] = hsl( r / n, g / n, b / n );
				const colour = `hsl(${ Math.round( h ) } ${ Math.round(
					Math.min( sat, 0.55 ) * 100
				) }% 22%)`;
				tints.set( src, colour );
				if (
					largest( P.track()?.art ) === src ||
					P.track()?.video?.poster === src
				) {
					root.style.setProperty( '--riff-tint', colour );
				}
			} catch {
				// An image from another origin without CORS cannot be read; the plain background stays.
			}
		};
		img.src = src;
	}

	return { open, close, sheet, pickTab, tint };
}
