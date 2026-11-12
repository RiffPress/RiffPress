/* The sidebar, on a wide screen in standalone mode: full, or a rail of icons, a choice this device
 * remembers. And the sidebar library's chips: which rows show, kept while the sidebar is drawn
 * again. And the player's dock at its foot, on the rail. */

// The sidebar's toggle in the frame: a library (two books and a leaning third), and the
// panel with an arrow to close it or to open it.
const PANEL =
	'M9.75 4.75H6C5.31 4.75 4.75 5.31 4.75 6V18C4.75 18.69 5.31 19.25 6 19.25H9.75M9.75 4.75H18C18.69 4.75 19.25 5.31 19.25 6V18C19.25 18.69 18.69 19.25 18 19.25H9.75M9.75 4.75V19.25';
const SIDEBAR_ICONS = {
	rest: 'M5.5 19.25V4.75M9.75 19.25V4.75M13.5 4.95L18.5 19.05',
	close: PANEL + 'M15.75 9.25L13 12L15.75 14.75',
	open: PANEL + 'M13 9.25L15.75 12L13 14.75',
};

export function sidebarPanel( ctx ) {
	const { app, nav, framed, __ } = ctx;

	ctx.shelfKind = '';
	function libraryShow( kind ) {
		ctx.shelfKind = kind;
		for ( const chip of nav?.querySelectorAll(
			'[data-riff-library-show]'
		) || [] ) {
			chip.setAttribute(
				'aria-pressed',
				String( chip.dataset.riffLibraryShow === kind )
			);
			chip.setAttribute( 'role', 'button' );
		}
		for ( const row of nav?.querySelectorAll(
			'[data-riff-library-kind]'
		) || [] ) {
			row.hidden = !! kind && row.dataset.riffLibraryKind !== kind;
		}
	}
	libraryShow( '' );
	// A link standing in as a button answers Space as a button does, not by scrolling the page.
	nav?.addEventListener( 'keydown', ( e ) => {
		if (
			e.key === ' ' &&
			e.target.matches?.( '[data-riff-library-show]' )
		) {
			e.preventDefault();
			e.target.click();
		}
	} );

	function sidebar( open, remember = true ) {
		app.dataset.sidebar = open ? 'full' : 'mini';
		const toggle = nav?.querySelector( '.riff-app-collapse' );
		toggle?.setAttribute( 'aria-expanded', String( open ) );
		// In the frame the toggle is a library at rest, and on hover the panel it would close
		// or open (riff.css shows one), named in a tooltip.
		if ( framed && toggle ) {
			if ( ! toggle.dataset.riffFramed ) {
				toggle.dataset.riffFramed = '';
				const svg = toggle.querySelector( 'svg' );
				if ( svg ) {
					svg.innerHTML = Object.entries( SIDEBAR_ICONS )
						.map(
							( [ name, d ] ) =>
								`<path class="riff-app-collapse-${ name }" d="${ d }"/>`
						)
						.join( '' );
				}
			}
			const label = open
				? __( 'Collapse sidebar', 'riff' )
				: __( 'Expand sidebar', 'riff' );
			toggle.setAttribute( 'aria-label', label );
			toggle.title = label;
		}
		if ( remember ) {
			try {
				localStorage.setItem( 'riff-sidebar', open ? 'full' : 'mini' );
			} catch {}
		}
	}

	// The player's dock at the sidebar's foot (Registry::dock()), on the rail a row of icons: a
	// press of one opens the sidebar to its view, opening it if it is closed, and so does opening
	// one from its button in the player's bar. Not a view the player opens again by itself, as the
	// page loads: the listener folded the sidebar, and it stays folded.
	nav?.addEventListener(
		'click',
		( e ) => {
			const toggle = e.target.closest?.( '[data-riff-dock-opens]' );
			if ( toggle && app.dataset.sidebar === 'mini' ) {
				sidebar( true );
				if ( toggle.getAttribute( 'aria-expanded' ) === 'true' ) {
					// Open already, under the rail: the sidebar opening shows it.
					e.preventDefault();
				}
			}
		},
		true
	);
	document.addEventListener( 'riff:view', ( e ) => {
		if (
			e.detail?.open &&
			app.dataset.sidebar === 'mini' &&
			e.detail.view?.closest?.( '[data-riff-dock]' ) &&
			window.navigator.userActivation?.isActive
		) {
			sidebar( true );
		}
	} );

	return { libraryShow, sidebar };
}
