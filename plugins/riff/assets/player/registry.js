/* The bar's controls and the views. Both are registered on the server (Riff\Registry, with
 * riff_register_control() and riff_register_view()) and drawn into the page before any script, Riff's
 * own as any plugin's; this brings each to life by its id. A control is something in the bar: a
 * button that runs a function or one of the player's own actions, or an element of its own.
 * window.riff.control() gives a registered control what it does, or adds one the server didn't
 * know of. The bar is only updated as the track changes, never drawn again, so a control keeps its
 * focus and a feature that found its button keeps finding it.
 *
 * A view is opened from its button in the bar, and on a phone from its chip in Now Playing (the
 * album, the stage, from the bar itself, which has no button for it): a screen of Now Playing,
 * which takes the whole screen above the bar (the album, the lyrics; now-playing.js shows them),
 * a panel beside the page, as Up next is, or a view of the Listen app's sidebar. Pressing the button
 * of the one open goes back to the page. One panel shows at a time, and the one a listener leaves
 * open opens again on their next visit.
 *
 * A sidebar view is docked in the Listen app's sidebar on a wide screen (Registry::dock()), under a
 * row of its own whose button opens and closes it there, so the listener browses beside it: its
 * panel is moved into its row. Docked views are not panels: several may be open at once, each
 * beside whatever panel or screen is, and each stays open as the listener moves about the app, as
 * Now Playing opens and closes, and with the sidebar folded to its rail (where the app opens the
 * sidebar for one opened from the bar). Those left open open again on the next visit, once their
 * script says they have something for the track. Wherever there is no sidebar to dock in, a
 * phone, the app as tabs, a page of the site, a sidebar view is a panel like any other; one docked
 * as the window narrows past the sidebar closes, to open again in the dock once it widens. window.riff.view() gives a registered view what it
 * does as it opens, or adds one the server didn't know of. A view can say it has nothing for a
 * track (its shown()): its button and chip hide while that track plays, and if it is open as the
 * track changes it gives way. */
import { fmt, read, speak, write } from 'riff-player/helpers';

// Strings are WordPress translations of this module (wp_set_script_module_translations()).
// Core prints wp.i18n only when there are translations, so without it the strings are the
// English they are written in.
const __ = window.wp?.i18n?.__ || ( ( english ) => english );

// An id names a control in data-riff-control and a view in data-riff-view.
const ID = /^[a-z][a-z0-9-]*$/;

// Where a view is: a screen of Now Playing, a panel beside the page, or the Listen app's sidebar.
const PLACES = [ 'screen', 'side', 'sidebar' ];
const placeOf = ( place ) => ( PLACES.includes( place ) ? place : 'screen' );
// A panel, or a sidebar view, which is one wherever there is no sidebar.
const panelish = ( v ) => v?.place === 'side' || v?.place === 'sidebar';

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
				el.hidden = ! fits( el.dataset.riffOpens, t );
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
		$( '.riff-bar-info' )?.setAttribute(
			'aria-expanded',
			String( root.classList.contains( 'is-open' ) )
		);
		for ( const chip of $$( '.riff-chips [data-riff-opens]' ) ) {
			chip.hidden = ! fits( chip.dataset.riffOpens, t );
			chip.setAttribute( 'aria-pressed', String( isOpen( chip.dataset.riffOpens ) ) );
		}
		for ( const row of dock?.querySelectorAll( '[data-riff-dock-item]' ) || [] ) {
			const id = row.dataset.riffDockItem;
			row.hidden = ! fits( id, t );
			row.querySelector( '[data-riff-dock-opens]' )?.setAttribute(
				'aria-expanded',
				String( docked.has( id ) )
			);
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
		const place = placeOf( v.place );
		views.set( id, {
			label: String( v.label || '' ),
			place,
			stage: !! v.stage,
			el:
				place === 'screen'
					? $( `.riff-np [data-riff-view="${ id }"]` )
					: side?.querySelector( `[data-riff-panel="${ id }"]` ),
			spec: {},
		} );
	}
	P.views = views;
	// The screen showing before the one open now, while Now Playing stayed open, and the one that
	// just gave way: where a view with nothing for the next track goes back to.
	let came = null;
	let left = null;

	// Whether a view has something for a track: what its script says (shown()), or yes.
	function fits( id, t = P.track() ) {
		const shown = views.get( id )?.spec.shown;
		return typeof shown !== 'function' || !! shown( t || null );
	}

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
		if ( docked.has( id ) ) {
			return true;
		}
		return panelish( v )
			? P.panelOpen === id
			: root.classList.contains( 'is-open' ) && P.showing === id;
	}

	function open( id, from = null ) {
		const v = views.get( id );
		if ( ! v ) {
			return;
		}
		if ( v.place === 'sidebar' && docks() && rowOf( id ) ) {
			dockOpen( id, { from } );
		} else if ( panelish( v ) ) {
			show( id, { from } );
		} else {
			P.open( id );
		}
	}

	function close( id ) {
		const v = views.get( id );
		if ( docked.has( id ) ) {
			dockClose( id );
		} else if ( panelish( v ) ) {
			if ( P.panelOpen === id ) {
				hide();
			}
		} else if ( v ) {
			P.close();
		}
	}

	// ---- The dock, in the Listen app's sidebar: drawn by the server with the sidebar
	// (Registry::dock()) and kept as the app draws its sidebar again (views.js), so what is open in
	// it stays as the listener browses.
	const DOCK = 'riff:dock';
	const docked = new Set();
	const dock = document.querySelector( '[data-riff-dock]' );
	const rowOf = ( id ) => dock?.querySelector( `[data-riff-dock-item="${ id }"]` );
	const toggleOf = ( id ) => rowOf( id )?.querySelector( '[data-riff-dock-opens]' );
	// Whether the sidebar is there to dock in, as the app's stylesheet says (--riff-dock): on a
	// wide screen, full or folded to its rail.
	const docks = () =>
		!! dock &&
		getComputedStyle( dock ).getPropertyValue( '--riff-dock' ).trim() === 'sidebar';

	// A sidebar view's region, under its row while there is a sidebar, or among the panels.
	function home( id ) {
		const v = views.get( id );
		if ( v?.place !== 'sidebar' || ! v.el ) {
			return;
		}
		const body = docks() ? rowOf( id )?.querySelector( '.riff-dock-body' ) : null;
		const to = body || side;
		if ( to && v.el.parentNode !== to ) {
			to.append( v.el );
		}
		// Docked, its row's body shows and hides it; among the panels, it is hidden until it opens.
		v.el.hidden = ! body && P.panelOpen !== id;
	}

	// The sidebar views a listener left open, docked or as a panel: each kept until they close it,
	// whether or not it is open now.
	const kept = () => ( read( localStorage, DOCK ) || '' ).split( ' ' ).filter( Boolean );
	function keep( id, on ) {
		const ids = kept().filter( ( other ) => other !== id );
		write( localStorage, DOCK, ( on ? [ ...ids, id ] : ids ).join( ' ' ) );
	}

	// Opened under its row. From its button in the bar, focus goes to its row, as a panel's goes
	// to its heading; from its row, it stays.
	function dockOpen( id, { from = null, quiet = false } = {} ) {
		const body = rowOf( id )?.querySelector( '.riff-dock-body' );
		if ( ! body || ! views.get( id )?.el ) {
			return;
		}
		home( id );
		body.hidden = false;
		docked.add( id );
		if ( ! quiet ) {
			keep( id, true );
			const head = toggleOf( id );
			if ( from !== head ) {
				head?.focus( { preventScroll: true } );
			}
			rowOf( id ).scrollIntoView?.( { block: 'nearest' } );
		}
		draw();
		fill( id );
	}

	// Closed under its row. Focus that was in it goes to its row, or, with that hidden (it had
	// nothing for the track), to Play.
	function dockClose( id, { quiet = false } = {} ) {
		if ( ! docked.delete( id ) ) {
			return;
		}
		const body = rowOf( id )?.querySelector( '.riff-dock-body' );
		const within = !! body?.contains( document.activeElement );
		if ( body ) {
			body.hidden = true;
		}
		if ( ! quiet ) {
			keep( id, false );
		}
		draw();
		if ( within ) {
			[ toggleOf( id ), ...$$( '.riff-play' ) ]
				.find( ( node ) => node?.isConnected && node.checkVisibility?.() !== false )
				?.focus( { preventScroll: true } );
		}
		announce( id, false );
	}

	// The views a listener left open in the dock, open again once each has something for the
	// track: as a track comes, and as a view's script arrives to say whether it does.
	function reopenDock() {
		if ( ! docks() ) {
			return;
		}
		for ( const id of kept() ) {
			if ( views.get( id )?.place === 'sidebar' && ! docked.has( id ) && fits( id ) ) {
				dockOpen( id, { quiet: true } );
			}
		}
	}

	// As the window crosses the width where the sidebar comes and goes: what was docked closes,
	// kept to open again in the dock, and a sidebar view open as a panel closes to open there.
	let docking = null;
	function rehome() {
		const now = docks();
		if ( now === docking ) {
			return;
		}
		// As the page starts, nothing opens yet: not before the views' scripts can say whether they
		// have something for the track.
		const starting = docking === null;
		docking = now;
		if ( ! now ) {
			[ ...docked ].forEach( ( id ) => dockClose( id, { quiet: true } ) );
		} else if ( views.get( P.panelOpen )?.place === 'sidebar' ) {
			hide( { quiet: true } );
		}
		for ( const [ id, v ] of views ) {
			if ( v.place === 'sidebar' ) {
				home( id );
			}
		}
		if ( now && ! starting ) {
			reopenDock();
		}
	}

	// A row's button opens and closes its view; Escape in a view closes it, back to its row.
	dock?.addEventListener( 'click', ( e ) => {
		const head = e.target.closest( '[data-riff-dock-opens]' );
		if ( head && ! e.defaultPrevented ) {
			const id = head.dataset.riffDockOpens;
			if ( docked.has( id ) ) {
				dockClose( id );
			} else {
				dockOpen( id, { from: head } );
			}
		}
	} );
	dock?.addEventListener( 'keydown', ( e ) => {
		const row = e.target.closest( '.riff-dock-body' )?.closest( '[data-riff-dock-item]' );
		if ( e.key === 'Escape' && row && docked.has( row.dataset.riffDockItem ) ) {
			e.preventDefault();
			e.stopPropagation();
			dockClose( row.dataset.riffDockItem );
		}
	} );

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
		const place = placeOf( spec.place );
		let el;
		let row = null;
		if ( place !== 'screen' ) {
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
		if ( place === 'sidebar' && dock ) {
			row = dockRow( id, spec, order );
		}
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
				row?.remove();
			},
		};
	}

	// A sidebar view's row in the dock, as the server draws one (Registry::dock()), in its order.
	function dockRow( id, spec, order ) {
		const row = document.createElement( 'div' );
		row.className = 'riff-dock-item';
		row.dataset.riffDockItem = id;
		row.dataset.riffOrder = String( order );
		const head = document.createElement( 'h2' );
		head.className = 'riff-dock-head';
		const press = document.createElement( 'button' );
		press.type = 'button';
		press.className = 'riff-dock-toggle';
		press.id = `riff-dock-toggle-${ id }`;
		press.dataset.riffDockOpens = id;
		press.setAttribute( 'aria-expanded', 'false' );
		press.setAttribute( 'aria-controls', `riff-dock-body-${ id }` );
		// An icon from the code that added the view, never from the page.
		press.innerHTML = typeof spec.icon === 'string' ? spec.icon : '';
		const words = document.createElement( 'span' );
		words.className = 'riff-dock-label';
		words.textContent = String( spec.label );
		press.append( words );
		head.append( press );
		const body = document.createElement( 'div' );
		body.className = 'riff-dock-body';
		body.id = `riff-dock-body-${ id }`;
		body.setAttribute( 'role', 'region' );
		body.setAttribute( 'aria-labelledby', press.id );
		body.hidden = true;
		row.append( head, body );
		const next = [ ...dock.querySelectorAll( '[data-riff-dock-item]' ) ].find(
			( r ) => ( Number( r.dataset.riffOrder ) || 50 ) > order
		);
		dock.insertBefore( row, next || null );
		return row;
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
			draw();
			if ( docked.has( id ) && ! fits( id ) ) {
				// Opened again in the dock before its script said it has nothing for the track: it
				// closes, still kept to open again.
				dockClose( id, { quiet: true } );
			} else if ( isOpen( id ) ) {
				settleView( id );
			}
			reopenDock();
			return () => {
				if ( views.get( id ) === known ) {
					known.spec = {};
					draw();
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
		home( id );
		draw();
		reopen();
		reopenDock();
		return made.forget;
	}

	// An open view, as the track changes or its script arrives: filled for the track, or, with
	// nothing for it, closed. A screen goes back to the one the listener came from, when that has
	// something for the track, or else to what Now Playing opens to; a panel closes. Focus that was
	// in it, or on its button, now hidden, goes where a view's opening puts it; focus anywhere else
	// stays. Either way the listener hears which closed.
	function settleView( id ) {
		if ( fits( id ) ) {
			fill( id );
			return;
		}
		const v = views.get( id );
		const active = document.activeElement;
		const lost =
			! active ||
			active === document.body ||
			!! v.el?.contains( active ) ||
			active.dataset?.riffOpens === id ||
			active.dataset?.riffDockOpens === id;
		if ( docked.has( id ) ) {
			// Its row hides with it: focus that was there goes to Play.
			dockClose( id );
			if ( lost && document.activeElement?.dataset?.riffDockOpens === id ) {
				$$( '.riff-play' )
					.find( ( node ) => node.checkVisibility?.() !== false )
					?.focus( { preventScroll: true } );
			}
		} else if ( panelish( v ) ) {
			hide();
			if ( lost && ! side.contains( document.activeElement ) ) {
				$$( '.riff-play' )
					.find( ( node ) => node.checkVisibility?.() !== false )
					?.focus( { preventScroll: true } );
			}
		} else {
			P.open( came && came !== id && screenOf( came ) && fits( came ) ? came : undefined );
			if ( ! lost && active.isConnected ) {
				active.focus( { preventScroll: true } );
			} else if ( ! document.activeElement || document.activeElement === document.body ) {
				// Where the view showing has nowhere of its own to take focus, as the album on a
				// wide screen, its button in the bar, or the bar's track for the album.
				[ $( `[data-riff-control="${ P.showing }"]` ), $( '.riff-bar-info' ), $( '.riff-play' ) ]
					.find( ( node ) => node && ! node.hidden && node.checkVisibility?.() !== false )
					?.focus( { preventScroll: true } );
			}
		}
		/* translators: %s: A view's name, such as Lyrics. */
		speak( fmt( __( '%s closed', 'riff' ), v.label ) );
	}
	const screenOf = ( id ) => views.get( id )?.place === 'screen';

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
		 *                                   own, `[data-riff-panel="<id>"]` for a panel and for a
		 *                                   sidebar view, docked or not, and Now Playing itself for
		 *                                   the album.
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
		rehome();
		if ( P.panelOpen ) {
			settle();
		}
	} );
	// The Listen app's frame changes as the window does (templates/standalone.php).
	window.addEventListener( 'riff:frame', rehome );

	function show( id, { from = null, quiet = false } = {} ) {
		const v = views.get( id );
		if ( ! v || ! panelish( v ) ) {
			return;
		}
		const was = P.panelOpen;
		if ( was && was !== id ) {
			announce( was, false );
		}
		for ( const [ other, o ] of views ) {
			// A docked view is not among the panels, and stays as it is.
			if ( panelish( o ) && o.el && o.el.parentNode === side ) {
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
			if ( v.place === 'sidebar' ) {
				keep( id, true );
			}
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
			if ( v.place === 'sidebar' ) {
				keep( id, false );
			}
		}
		// Focus goes back to what opened it, or to its button in the bar, or, with those hidden
		// (the panel had nothing for the track), to Play.
		if ( within ) {
			const back = [
				opener,
				$( `.riff-chips [data-riff-opens="${ id }"]` ),
				$( `[data-riff-control="${ id }"]` ),
				...$$( '.riff-play' ),
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
			settleView( P.panelOpen );
		}
		[ ...docked ].forEach( settleView );
		if ( isOpen( P.showing ) ) {
			settleView( P.showing );
		} else if ( ! P.np.hidden && P.showing && fits( P.showing ) ) {
			// Sliding away: still filled, as it is still in sight.
			fill( P.showing );
		}
		reopen();
		reopenDock();
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
	// screen only, as on a phone it would cover what they came to. Never beside the deck on its
	// own (now-playing.js, immerse()), which puts it away and asks for it here once it is left.
	function reopen() {
		const id = read( localStorage, PANEL );
		if (
			id &&
			! P.panelOpen &&
			! P.deckAlone?.() &&
			panelish( views.get( id ) ) &&
			! ( views.get( id ).place === 'sidebar' && docks() ) &&
			P.track() &&
			fits( id ) &&
			beside()
		) {
			show( id, { quiet: true } );
		}
	}

	// Each sidebar view in its row, where there is a sidebar.
	rehome();

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
		closeView: ( id ) => {
			if ( id !== undefined && id !== null ) {
				close( String( id ) );
			} else if ( P.panelOpen ) {
				hide();
			} else {
				P.close();
			}
		},
		hidePanel: ( options ) => hide( options ),
		reopenPanel: reopen,
		viewOpened: ( id, isNowOpen ) => {
			if ( screenOf( id ) ) {
				if ( isNowOpen ) {
					came = left !== id ? left : null;
					left = null;
				} else {
					// Left for another while Now Playing stays open, or with Now Playing closing.
					left = root.classList.contains( 'is-open' ) ? id : null;
				}
			}
			if ( isNowOpen ) {
				fill( id );
			} else {
				announce( id, false );
			}
		},
	};
}
