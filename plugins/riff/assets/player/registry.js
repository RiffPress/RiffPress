/* The bar's controls and the panels. Each control is added through window.riff.control(), Riff's
 * own as any plugin's: the heart, the badges, Play on another device, the volume and the way into
 * Now Playing are taken from the bar's template and added here like any other, so none is special
 * to the bar. A control is a button that runs a function or one of the player's own actions, or an
 * element its code brings. Each keeps its place by its order; the bar is only updated as the track
 * changes, never drawn again, so a control keeps its focus and a feature that found its button
 * keeps finding it.
 *
 * A panel is added through window.riff.panel(), Up next as any plugin's, such as Lyrics: its own
 * thing, beside the page and Now Playing on a wide screen, opened from its button in the bar, and
 * over everything on a phone, opened from its chip in Now Playing. One shows at a time, and the
 * one a listener leaves open opens again on their next visit. */
import { read, write } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

// Where a panel stands beside the page (riff.css), and where it opens in the controls' strip of a
// touch screen on its side, beside the turntable; anywhere else it covers the screen.
const BESIDE =
	'(min-width: 900px) and (not ((pointer: coarse) and (min-aspect-ratio: 5 / 4) and (max-height: 760px)))';
const STRIP =
	'(pointer: coarse) and (min-aspect-ratio: 5 / 4) and (max-height: 760px)';

// A control's id names it in data-riff-control and in its class.
const ID = /^[a-z][a-z0-9-]*$/;

export function registry( P ) {
	const { $, root, emit } = P;
	const holder = $( '[data-riff-controls]' );
	const controls = new Map();
	let added = 0;

	// By order, then in the order they were added.
	const before = ( a, b ) => a.order - b.order || a.added - b.added;

	function make( id, spec ) {
		if ( typeof spec.element === 'function' ) {
			return spec.element();
		}
		const button = document.createElement( 'button' );
		button.type = 'button';
		button.className = `riff-btn riff-control riff-control-${ id }`;
		if ( spec.action ) {
			button.dataset.riffAction = String( spec.action );
		}
		// An icon from the code that added the control, never from the page.
		button.innerHTML = typeof spec.icon === 'string' ? spec.icon : '';
		if ( typeof spec.run === 'function' ) {
			button.addEventListener( 'click', () => {
				spec.run( P.track() || null, button );
				draw();
			} );
		}
		return button;
	}

	// What a control says follows the track: its name, whether it is pressed, whether it shows.
	function draw( t = P.track() ) {
		for ( const { spec, el } of controls.values() ) {
			if ( ! spec.element ) {
				const label =
					typeof spec.label === 'function'
						? spec.label( t || null )
						: spec.label;
				if ( label && el.getAttribute( 'aria-label' ) !== label ) {
					el.setAttribute( 'aria-label', String( label ) );
				}
			}
			if ( typeof spec.pressed === 'function' ) {
				const pressed = spec.pressed( t || null );
				if ( typeof pressed === 'boolean' ) {
					el.setAttribute( 'aria-pressed', String( pressed ) );
				} else {
					el.removeAttribute( 'aria-pressed' );
				}
			}
			if ( typeof spec.shown === 'function' ) {
				el.hidden = ! spec.shown( t || null );
			}
		}
	}

	function control( id, spec ) {
		id = String( id );
		const usable =
			ID.test( id ) &&
			spec &&
			( typeof spec.element === 'function' ||
				( spec.label &&
					( typeof spec.run === 'function' || spec.action ) ) );
		if ( ! usable ) {
			return () => {};
		}
		controls.get( id )?.el.remove();
		const el = make( id, spec );
		if ( ! ( el instanceof HTMLElement ) ) {
			controls.delete( id );
			return () => {};
		}
		el.dataset.riffControl = id;
		// On a phone the bar holds the track, Play and what a control asks to keep there.
		el.classList.toggle( 'riff-desk', !! spec.wide );
		const entry = {
			spec,
			el,
			order: Number.isFinite( spec.order ) ? spec.order : 50,
			added: added++,
		};
		controls.set( id, entry );
		const next = [ ...controls.values() ]
			.filter( ( c ) => c !== entry )
			.sort( before )
			.find( ( c ) => before( entry, c ) < 0 );
		holder.insertBefore( el, next ? next.el : null );
		draw();
		return () => {
			if ( controls.get( id ) === entry ) {
				controls.delete( id );
				el.remove();
			}
		};
	}

	// Riff's own, from the bar's template, through the same door.
	const own = $( '.riff-bar-own' )?.content;
	const take = ( name ) =>
		own?.querySelector( `[data-riff-own="${ name }"]` );
	if ( own ) {
		control( 'like', { order: 10, element: () => take( 'like' ) } );
		control( 'badges', {
			order: 20,
			wide: true,
			element: () => take( 'badges' ),
		} );
		control( 'cast', { order: 60, element: () => take( 'cast' ) } );
		control( 'volume', {
			order: 70,
			wide: true,
			element: () => take( 'volume' ),
		} );
		control( 'open', {
			order: 80,
			wide: true,
			element: () => take( 'open' ),
		} );
	}

	// ---- The panels.
	const PANEL = 'riff:panel';
	const side = $( '.riff-side' );
	const title = $( '.riff-side-title' );
	const shut = $( '.riff-side-close' );
	const chips = $( '.riff-chips' );
	const panels = new Map();
	P.side = side;
	P.panelOpen = null;
	let opener = null;

	const beside = () => window.matchMedia( BESIDE ).matches;

	function panel( id, spec ) {
		id = String( id );
		if ( ! ID.test( id ) || ! spec || ! spec.label ) {
			return () => {};
		}
		panels.get( id )?.forget();
		let el = side.querySelector( `[data-riff-panel="${ id }"]` );
		const made = ! el;
		if ( made ) {
			el = document.createElement( 'div' );
			el.className = `riff-panel riff-panel-${ id }`;
			el.dataset.riffPanel = id;
			el.hidden = true;
			side.append( el );
		}
		const order = Number.isFinite( spec.order ) ? spec.order : 50;
		// Its button in the bar, on a wide screen.
		const unbar = control( id, {
			label: String( spec.label ),
			icon: spec.icon,
			order,
			wide: true,
			pressed: () => P.panelOpen === id,
			run: ( t, button ) => toggle( id, button ),
		} );
		// Its chip in Now Playing, on a phone, among the others by order.
		const chip = document.createElement( 'button' );
		chip.type = 'button';
		chip.className = 'riff-chip riff-mobile';
		chip.dataset.riffChip = id;
		chip.innerHTML = typeof spec.icon === 'string' ? spec.icon : '';
		const words = document.createElement( 'span' );
		words.textContent = String( spec.label );
		chip.append( words );
		chip.addEventListener( 'click', () => show( id, { from: chip } ) );
		const entry = { spec, el, chip, order, added: added++ };
		const next = [ ...panels.values() ]
			.sort( before )
			.find( ( p ) => before( entry, p ) < 0 );
		chips?.insertBefore( chip, next ? next.chip : null );
		entry.forget = () => {
			if ( panels.get( id ) !== entry ) {
				return;
			}
			if ( P.panelOpen === id ) {
				hide( { quiet: true } );
			}
			panels.delete( id );
			unbar();
			chip.remove();
			if ( made ) {
				el.remove();
			}
		};
		panels.set( id, entry );
		reopen();
		return entry.forget;
	}

	function toggle( id, from ) {
		if ( P.panelOpen === id ) {
			hide();
		} else {
			show( id, { from } );
		}
	}

	// Closing everything else the listener sees takes it out of reach while a phone's panel covers
	// it, so a screen reader and Tab keep to the panel. The track menu is left alone: it opens
	// inside the panel from Up next, and must take the focus there.
	function cover( on ) {
		const others = on
			? [ ...document.body.children, ...root.children ].filter(
					( node ) =>
						node !== root &&
						node !== side &&
						! node.classList.contains( 'riff-menu' ) &&
						! node.id?.startsWith( 'a11y-speak' ) &&
						! node.inert
				)
			: [ ...document.querySelectorAll( '[data-riff-side-inert]' ) ];
		for ( const node of others ) {
			node.inert = on;
			node.toggleAttribute( 'data-riff-side-inert', on );
		}
	}

	function show( id, { from = null, quiet = false } = {} ) {
		const entry = panels.get( id );
		if ( ! entry ) {
			return;
		}
		const was = P.panelOpen;
		if ( was && was !== id ) {
			panels.get( was ).el.hidden = true;
			announce( panels.get( was ), false );
		}
		for ( const p of panels.values() ) {
			p.el.hidden = p !== entry;
		}
		title.textContent = String( entry.spec.label );
		shut.setAttribute(
			'aria-label',
			/* translators: %s: The panel's name, such as Up next. */
			__( 'Close %s', 'riff' ).replace( '%s', String( entry.spec.label ) )
		);
		if ( ! quiet ) {
			opener = from || document.activeElement;
			write( localStorage, PANEL, id );
		}
		P.panelOpen = id;
		side.hidden = false;
		document.documentElement.classList.add( 'riff-panel-open' );
		// Over everything on a phone, so a dialog there; beside the page on a wide screen, and
		// beside the turntable in its strip.
		const sheet = ! beside() && ! window.matchMedia( STRIP ).matches;
		if ( sheet ) {
			side.setAttribute( 'role', 'dialog' );
			side.setAttribute( 'aria-modal', 'true' );
		} else {
			side.removeAttribute( 'role' );
			side.removeAttribute( 'aria-modal' );
		}
		cover( false );
		if ( sheet ) {
			cover( true );
		}
		if ( ! quiet ) {
			title.focus( { preventScroll: true } );
		}
		draw();
		fill( entry );
	}

	function hide( { quiet = false } = {} ) {
		const id = P.panelOpen;
		const entry = panels.get( id );
		if ( ! entry ) {
			return;
		}
		const within = side.contains( document.activeElement );
		entry.el.hidden = true;
		side.hidden = true;
		P.panelOpen = null;
		document.documentElement.classList.remove( 'riff-panel-open' );
		cover( false );
		if ( ! quiet ) {
			write( localStorage, PANEL, '' );
		}
		// Focus goes back to what opened it, or to its button in the bar.
		if ( within ) {
			const back = [
				opener,
				entry.chip,
				$( `[data-riff-control="${ id }"]` ),
			].find(
				( node ) =>
					node?.isConnected && node.checkVisibility?.() !== false
			);
			( back || $( '.riff-bar-info' ) )?.focus();
		}
		opener = null;
		draw();
		announce( entry, false );
	}

	// A panel's content: its own render, then riff.panel for anyone listening.
	function fill( entry ) {
		entry.spec.render?.( entry.el, P.track() || null );
		announce( entry, true );
	}

	function announce( entry, open ) {
		/**
		 * Fires when a panel opens or closes, Up next included, and again for an open panel when
		 * the track changes. A panel's script fills it here, or in the `render` it was added with.
		 *
		 * @since 5.8.0
		 *
		 * @param {Object}      detail       What changed.
		 * @param {string}      detail.id    The panel's id.
		 * @param {boolean}     detail.open  Whether it is open now.
		 * @param {HTMLElement} detail.panel The panel, `[data-riff-panel="<id>"]`.
		 * @param {Object|null} detail.track The track playing.
		 * @param {Object}      api          `window.riff`.
		 */
		emit( 'panel', {
			id: entry.el.dataset.riffPanel,
			open,
			panel: entry.el,
			track: P.track() || null,
		} );
	}

	root.addEventListener( 'riff:track', () => {
		const entry = panels.get( P.panelOpen );
		if ( entry ) {
			fill( entry );
		}
		reopen();
	} );

	// Escape closes the panel, and stays with it; on a phone Tab keeps to it.
	side.addEventListener( 'keydown', ( e ) => {
		if ( e.key === 'Escape' && P.panelOpen ) {
			e.preventDefault();
			e.stopPropagation();
			hide();
		} else if (
			e.key === 'Tab' &&
			side.getAttribute( 'aria-modal' ) === 'true'
		) {
			const inside = [
				...side.querySelectorAll(
					'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
				),
			].filter(
				( node ) =>
					! node.disabled && node.checkVisibility?.() !== false
			);
			const first = inside[ 0 ];
			const last = inside[ inside.length - 1 ];
			if ( ! first ) {
				return;
			}
			if (
				e.shiftKey &&
				( document.activeElement === first ||
					document.activeElement === title )
			) {
				e.preventDefault();
				last.focus();
			} else if ( ! e.shiftKey && document.activeElement === last ) {
				e.preventDefault();
				first.focus();
			}
		}
	} );

	// The panel a listener left open, open again beside the page once something plays: on a wide
	// screen only, as on a phone it would cover what they came to.
	function reopen() {
		const id = read( localStorage, PANEL );
		if (
			id &&
			! P.panelOpen &&
			panels.has( id ) &&
			P.track() &&
			beside()
		) {
			show( id, { quiet: true } );
		}
	}

	// Up next, Riff's own.
	panel( 'queue', {
		label: __( 'Up next', 'riff' ),
		icon: take( 'queue-icon' )?.innerHTML || '',
		order: 40,
		render: ( el ) =>
			el
				.querySelector( '[aria-current]' )
				?.scrollIntoView( { block: 'nearest' } ),
	} );

	return {
		control,
		drawControls: draw,
		panel,
		showPanel: ( id ) => show( id ),
		hidePanel: ( options ) => hide( options ),
	};
}
