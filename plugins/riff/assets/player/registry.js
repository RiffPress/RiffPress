/* The bar's controls and the views. Both are registered on the server (Riff\Registry, with
 * riff_register_control() and riff_register_view()) and drawn into the page before any script, Riff's
 * own as any plugin's; this brings each to life by its id. A control is something in the bar: a
 * button that runs a function or one of the player's own actions, or an element of its own.
 * window.riff.control() gives a registered control what it does, or adds one the server didn't
 * know of. The bar is only updated as the track changes, never drawn again, so a control keeps its
 * focus and a feature that found its button keeps finding it.
 *
 * A view is opened from its button in the bar, and on a phone from its chip in Now Playing: a
 * screen of Now Playing, which takes the whole screen above the bar (the album, the turntable, the
 * lyrics; now-playing.js shows them), or a panel beside the page, as Up next is. Pressing the
 * button of the one open goes back to the page. One panel shows at a time, and the one a listener
 * leaves open opens again on their next visit. window.riff.view() gives a registered view what it
 * does as it opens, or adds one the server didn't know of. */
import { read, write } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

// An id names a control in data-riff-control and a view in data-riff-view.
const ID = /^[a-z][a-z0-9-]*$/;

export function registry( P ) {
	const { $, $$, root, emit } = P;
	const holder = $( '[data-riff-controls]' );
	const controls = new Map();
	let added = 0;

	// By order, then in the order they were added.
	const before = ( a, b ) => a.order - b.order || a.added - b.added;

	// What the server drew, each in its place.
	for ( const el of holder?.querySelectorAll( ':scope > [data-riff-control]' ) || [] ) {
		controls.set( el.dataset.riffControl, {
			spec: {},
			el,
			order: Number( el.dataset.riffOrder ) || 50,
			added: added++,
			server: true,
		} );
	}

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
		return button;
	}

	// A press runs what the control's script gave it, once wired, whoever drew the button.
	function wire( entry ) {
		// An element of a control's own is its own to wire, except a view's button made here.
		if ( entry.wired || ( entry.spec.element && ! entry.el.dataset.riffOpens ) ) {
			return;
		}
		entry.wired = true;
		entry.el.addEventListener( 'click', () => {
			if ( entry.el.dataset.riffOpens ) {
				toggle( entry.el.dataset.riffOpens, entry.el );
			} else if ( typeof entry.spec.run === 'function' ) {
				entry.spec.run( P.track() || null, entry.el );
			}
			draw();
		} );
	}

	// What a control says follows the track: its name, whether it is pressed, whether it shows.
	function draw( t = P.track() ) {
		for ( const { spec, el } of controls.values() ) {
			if ( el.dataset.riffOpens ) {
				el.setAttribute( 'aria-pressed', String( isOpen( el.dataset.riffOpens ) ) );
				continue;
			}
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
		for ( const chip of $$( '.riff-chips [data-riff-opens]' ) ) {
			chip.setAttribute( 'aria-pressed', String( isOpen( chip.dataset.riffOpens ) ) );
		}
	}

	function control( id, spec ) {
		id = String( id );
		if ( ! ID.test( id ) || ! spec ) {
			return () => {};
		}
		const drawn = controls.get( id );
		// One the server drew: it keeps its element and its place, and takes what it does from here.
		if ( drawn?.server && ! spec.element ) {
			drawn.spec = spec;
			wire( drawn );
			draw();
			return () => {
				if ( controls.get( id ) === drawn ) {
					drawn.spec = {};
				}
			};
		}
		const usable =
			typeof spec.element === 'function' ||
			( spec.label && ( typeof spec.run === 'function' || spec.action ) );
		if ( ! usable ) {
			return () => {};
		}
		drawn?.el.remove();
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
		wire( entry );
		draw();
		return () => {
			if ( controls.get( id ) === entry ) {
				controls.delete( id );
				el.remove();
			}
		};
	}

	// The server's controls, wired for their buttons; their own scripts give them more.
	for ( const entry of controls.values() ) {
		if ( entry.el.matches( 'button' ) && ! entry.el.dataset.riffAction ) {
			wire( entry );
		}
	}

	// ---- The views.
	const PANEL = 'riff:panel';
	const side = $( '.riff-side' );
	const title = $( '.riff-side-title' );
	const shut = $( '.riff-side-close' );
	const chips = $( '.riff-chips' );
	// Each view: where it opens, whether it is Now Playing's own stage, its region, and what it
	// does as it opens.
	const views = new Map();
	P.side = side;
	P.panelOpen = null;
	let opener = null;

	for ( const [ id, v ] of Object.entries( P.data.views || {} ) ) {
		views.set( id, {
			label: String( v.label || '' ),
			place: v.place === 'side' ? 'side' : 'screen',
			stage: !! v.stage,
			el:
				v.place === 'side'
					? side?.querySelector( `[data-riff-panel="${ id }"]` )
					: $( `.riff-np [data-riff-view="${ id }"]` ),
			spec: {},
		} );
	}
	P.views = views;

	// Where a panel stands, as riff.css lays it out (--riff-side-place): beside the page, in the
	// controls' strip of a touch screen on its side, beside the turntable, or over everything as a
	// sheet. Read from the stylesheet, so the shapes are written down once.
	const where = () =>
		side
			? getComputedStyle( side ).getPropertyValue( '--riff-side-place' ).trim()
			: 'sheet';
	const beside = () => where() === 'beside';

	function isOpen( id ) {
		const v = views.get( id );
		if ( ! v ) {
			return false;
		}
		return v.place === 'side'
			? P.panelOpen === id
			: root.classList.contains( 'is-open' ) && P.showing === id;
	}

	function open( id, from = null ) {
		const v = views.get( id );
		if ( ! v ) {
			return;
		}
		if ( v.place === 'side' ) {
			show( id, { from } );
		} else {
			P.open( id );
		}
	}

	function close( id ) {
		const v = views.get( id );
		if ( v?.place === 'side' ) {
			hide();
		} else if ( v ) {
			P.close();
		}
	}

	function toggle( id, from ) {
		if ( isOpen( id ) ) {
			close( id );
		} else {
			open( id, from );
		}
	}

	// A chip opens its view from Now Playing on a phone; Now Playing is already open there.
	chips?.addEventListener( 'click', ( e ) => {
		const chip = e.target.closest( '[data-riff-opens]' );
		if ( chip ) {
			open( chip.dataset.riffOpens, chip );
			draw();
		}
	} );

	// A view the server didn't draw, from a script: its region, its button and its chip.
	function adopt( id, spec ) {
		const place = spec.place === 'side' ? 'side' : 'screen';
		let el;
		if ( place === 'side' ) {
			el = document.createElement( 'div' );
			el.className = `riff-panel riff-panel-${ id }`;
			el.dataset.riffPanel = id;
			el.dataset.riffLabel = String( spec.label );
			side.append( el );
		} else {
			el = document.createElement( 'section' );
			el.className = `riff-view riff-view-${ id }`;
			el.dataset.riffView = id;
			el.tabIndex = -1;
			el.setAttribute( 'aria-label', String( spec.label ) );
			$( '.riff-stage' ).after( el );
		}
		el.hidden = true;
		const order = Number.isFinite( spec.order ) ? spec.order : 50;
		const button = make( id, { icon: spec.icon } );
		button.dataset.riffOpens = id;
		button.dataset.riffOrder = String( order );
		button.setAttribute( 'aria-label', String( spec.label ) );
		const unbar = control( id, { element: () => button, order, wide: true } );
		wire( controls.get( id ) );
		const chip = document.createElement( 'button' );
		chip.type = 'button';
		chip.className = 'riff-chip riff-mobile';
		chip.dataset.riffChip = id;
		chip.dataset.riffOpens = id;
		chip.dataset.riffOrder = String( order );
		chip.innerHTML = typeof spec.icon === 'string' ? spec.icon : '';
		const words = document.createElement( 'span' );
		words.textContent = String( spec.label );
		chip.append( words );
		const next = [ ...( chips?.querySelectorAll( '[data-riff-opens]' ) || [] ) ].find(
			( c ) => ( Number( c.dataset.riffOrder ) || 50 ) > order
		);
		chips?.insertBefore( chip, next || null );
		return {
			view: { label: String( spec.label ), place, stage: false, el, spec },
			forget: () => {
				unbar();
				chip.remove();
				el.remove();
			},
		};
	}

	function view( id, spec ) {
		id = String( id );
		if ( ! ID.test( id ) || ! spec ) {
			return () => {};
		}
		const known = views.get( id );
		if ( known && ! known.adopted ) {
			// One the server drew: it takes what it does as it opens from here.
			known.spec = spec;
			if ( isOpen( id ) ) {
				fill( id );
			}
			return () => {
				if ( views.get( id ) === known ) {
					known.spec = {};
				}
			};
		}
		if ( ! spec.label ) {
			return () => {};
		}
		known?.forget?.();
		const { view: made, forget } = adopt( id, spec );
		made.adopted = true;
		made.forget = () => {
			if ( views.get( id ) !== made ) {
				return;
			}
			if ( isOpen( id ) ) {
				close( id );
			}
			views.delete( id );
			forget();
		};
		views.set( id, made );
		draw();
		reopen();
		return made.forget;
	}

	// A view's content: its own render, then riff.view for anyone listening.
	function fill( id ) {
		const v = views.get( id );
		if ( ! v ) {
			return;
		}
		v.spec.render?.( v.el || P.np, P.track() || null );
		announce( id, true );
	}

	function announce( id, isNowOpen ) {
		const v = views.get( id );
		/**
		 * Fires when a view opens or closes, Riff's own included, and again for an open view when
		 * the track changes. A view's script fills it here, or in the `render` it was given.
		 *
		 * @since 5.8.0
		 *
		 * @param {Object}      detail       What changed.
		 * @param {string}      detail.id    The view's id.
		 * @param {boolean}     detail.open  Whether it is open now.
		 * @param {HTMLElement} detail.view  Its region: `[data-riff-view="<id>"]` for a screen of its
		 *                                   own, `[data-riff-panel="<id>"]` for a panel, and Now
		 *                                   Playing itself for the album or the turntable.
		 * @param {Object|null} detail.track The track playing.
		 * @param {Object}      api          `window.riff`.
		 */
		emit( 'view', {
			id,
			open: isNowOpen,
			view: v?.el || P.np,
			track: P.track() || null,
		} );
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

	// Over everything on a phone, so a dialog there with the rest out of reach; beside the page on
	// a wide screen, and beside the turntable in its strip. Settled again as the screen changes
	// shape while a panel is open.
	function settle() {
		const sheet = where() === 'sheet';
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
			// Become a sheet with focus left on the page behind it: focus comes into it.
			if ( ! side.contains( document.activeElement ) ) {
				title.focus( { preventScroll: true } );
			}
		}
	}
	window.addEventListener( 'resize', () => {
		if ( P.panelOpen ) {
			settle();
		}
	} );

	function show( id, { from = null, quiet = false } = {} ) {
		const v = views.get( id );
		if ( ! v || v.place !== 'side' ) {
			return;
		}
		const was = P.panelOpen;
		if ( was && was !== id ) {
			announce( was, false );
		}
		for ( const [ other, o ] of views ) {
			if ( o.place === 'side' && o.el ) {
				o.el.hidden = other !== id;
			}
		}
		title.textContent = v.label;
		shut.setAttribute(
			'aria-label',
			/* translators: %s: The panel's name, such as Up next. */
			__( 'Close %s', 'riff' ).replace( '%s', v.label )
		);
		if ( ! quiet ) {
			opener = from || document.activeElement;
			write( localStorage, PANEL, id );
		}
		P.panelOpen = id;
		side.hidden = false;
		document.documentElement.classList.add( 'riff-panel-open' );
		settle();
		if ( ! quiet ) {
			title.focus( { preventScroll: true } );
		}
		draw();
		fill( id );
	}

	function hide( { quiet = false } = {} ) {
		const id = P.panelOpen;
		const v = views.get( id );
		if ( ! v ) {
			return;
		}
		const within = side.contains( document.activeElement );
		if ( v.el ) {
			v.el.hidden = true;
		}
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
				$( `.riff-chips [data-riff-opens="${ id }"]` ),
				$( `[data-riff-control="${ id }"]` ),
			].find(
				( node ) =>
					node?.isConnected && node.checkVisibility?.() !== false
			);
			back?.focus();
		}
		opener = null;
		draw();
		announce( id, false );
	}

	root.addEventListener( 'riff:track', () => {
		if ( P.panelOpen ) {
			fill( P.panelOpen );
		}
		if ( ! P.np.hidden && P.showing ) {
			fill( P.showing );
		}
		reopen();
	} );

	// Escape closes the panel, and stays with it; on a phone Tab keeps to it.
	side?.addEventListener( 'keydown', ( e ) => {
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
			views.get( id )?.place === 'side' &&
			P.track() &&
			beside()
		) {
			show( id, { quiet: true } );
		}
	}

	// Up next, Riff's own: the track playing kept in sight as it opens.
	view( 'queue', {
		render: ( el ) =>
			el
				.querySelector( '[aria-current]' )
				?.scrollIntoView( { block: 'nearest' } ),
	} );

	return {
		control,
		drawControls: draw,
		view,
		openView: ( id ) => open( String( id ) ),
		closeView: () => {
			if ( P.panelOpen ) {
				hide();
			} else {
				P.close();
			}
		},
		hidePanel: ( options ) => hide( options ),
		viewOpened: ( id, isNowOpen ) =>
			isNowOpen ? fill( id ) : announce( id, false ),
	};
}
