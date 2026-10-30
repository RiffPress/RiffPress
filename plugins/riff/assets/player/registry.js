/* The bar's controls. Each is added through window.riff.control(), Riff's own as any plugin's: the
 * heart, the badges, Play on another device, the volume and the way into Now Playing are taken
 * from the bar's template and added here like any other, so none is special to the bar. A control
 * is a button that runs a function or one of the player's own actions, or an element its code
 * brings. Each keeps its place by its order; the bar is only updated as the track changes, never
 * drawn again, so a control keeps its focus and a feature that found its button keeps finding it. */

// A control's id names it in data-riff-control and in its class.
const ID = /^[a-z][a-z0-9-]*$/;

export function registry( P ) {
	const { $ } = P;
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
	const take = ( name ) => own?.querySelector( `[data-riff-own="${ name }"]` );
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

	return { control, drawControls: draw };
}
