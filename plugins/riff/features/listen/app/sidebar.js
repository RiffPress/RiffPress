/* The sidebar, on a wide screen in standalone mode: full, or a rail of icons, a choice this device
 * remembers. And the sidebar library's chips: which rows show, kept while the sidebar is drawn
 * again. */

// The sidebar's toggle in the desktop frame: a library (two books and a leaning third), and the
// panel with an arrow to close it or to open it.
const PANEL =
	'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v12h3V6H5zm5 0v12h9V6h-9z';
const SIDEBAR_ICONS = {
	rest: 'M3 21V3h2v18H3zm5 0V3h2v18H8zm5-17.4L14.9 3l5.7 17.4-1.9.6L13 3.6z',
	close: PANEL + 'm6.4 3.4-2.6 2.6 2.6 2.6-1.1 1.1-3.7-3.7 3.7-3.7z',
	open: PANEL + 'm1 3.4 2.6 2.6-2.6 2.6 1.1 1.1 3.7-3.7-3.7-3.7z',
};

export function sidebarPanel( ctx ) {
	const { app, nav, desktop, __ } = ctx;

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
		// In the desktop frame the toggle is a library at rest, and on hover the panel it would close
		// or open (riff.css shows one), named in a tooltip.
		if ( desktop && toggle ) {
			if ( ! toggle.dataset.riffDesktop ) {
				toggle.dataset.riffDesktop = '';
				const svg = toggle.querySelector( 'svg' );
				if ( svg ) {
					svg.innerHTML = Object.entries( SIDEBAR_ICONS )
						.map(
							( [ name, d ] ) =>
								`<path class="riff-app-collapse-${ name }" fill-rule="evenodd" d="${ d }"/>`
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

	return { libraryShow, sidebar };
}
