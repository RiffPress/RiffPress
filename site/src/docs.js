/**
 * The docs' two helpers, on every Source page that has them.
 *
 * The sidebar's Menu: on a phone the docs' sidebar (site-nav.js draws it) folds into a Menu button
 * in a bar held at the top of the window, which opens it as a sheet over the page. Escape, a press
 * outside it, or a tab out of it closes it, and focus goes back to the button. Without this script
 * the button stays hidden and the sidebar is a plain list above the article.
 *
 * "On this page": the heading being read is marked in the list as the page scrolls, found once per
 * scroll with an IntersectionObserver rather than on every frame. Nothing moves, so it is the same
 * with reduced motion.
 */
const side = document.querySelector( '.docs-nav' );
const button = side?.querySelector( '.docs-menu' );
const list = side && document.getElementById( button?.getAttribute( 'aria-controls' ) );

if ( side && button && list ) {
	const phone = window.matchMedia( '(max-width: 899.98px)' );
	const scrim = document.createElement( 'div' );
	scrim.className = 'docs-scrim';
	scrim.hidden = true;
	// At the end of the page, so nothing between the sidebar and the article moves.
	document.body.append( scrim );
	const set = ( open, focus = false ) => {
		button.setAttribute( 'aria-expanded', String( open ) );
		side.classList.toggle( 'is-open', open );
		scrim.hidden = ! open;
		document.documentElement.classList.toggle( 'docs-menu-open', open );
		if ( open ) {
			( list.querySelector( '[aria-current="page"]' ) || list.querySelector( 'a' ) )?.focus();
		} else if ( focus ) {
			button.focus();
		}
	};
	side.classList.add( 'has-menu' );
	button.hidden = false;
	button.addEventListener( 'click', () => set( button.getAttribute( 'aria-expanded' ) !== 'true' ) );
	scrim.addEventListener( 'click', () => set( false, true ) );
	document.addEventListener( 'keydown', ( e ) => {
		if ( e.key === 'Escape' && side.classList.contains( 'is-open' ) ) {
			set( false, true );
		}
	} );
	side.addEventListener( 'focusout', ( e ) => {
		if ( side.classList.contains( 'is-open' ) && e.relatedTarget && ! side.contains( e.relatedTarget ) ) {
			set( false );
		}
	} );
	phone.addEventListener( 'change', () => set( false ) );
}

const links = [ ...document.querySelectorAll( '.toc-box a[href^="#"]' ) ];
const targets = links.map( ( a ) => document.getElementById( decodeURIComponent( a.hash.slice( 1 ) ) ) ).filter( Boolean );

if ( targets.length && 'IntersectionObserver' in window ) {
	// Under the line a reader's eye is on, a little below the top of the window.
	const line = () => Math.min( 160, window.innerHeight * 0.25 );
	let shown = null;
	const mark = () => {
		let at = targets[ 0 ];
		for ( const t of targets ) {
			if ( t.getBoundingClientRect().top - line() <= 0 ) {
				at = t;
			}
		}
		// At the very end of the page, the last section is the one being read.
		if ( window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2 ) {
			at = targets[ targets.length - 1 ];
		}
		if ( at === shown ) {
			return;
		}
		shown = at;
		for ( const a of links ) {
			if ( a.hash.slice( 1 ) === at.id ) {
				a.setAttribute( 'aria-current', 'location' );
			} else {
				a.removeAttribute( 'aria-current' );
			}
		}
	};
	const watch = new IntersectionObserver( mark, { rootMargin: '0px 0px -60% 0px', threshold: [ 0, 1 ] } );
	targets.forEach( ( t ) => watch.observe( t ) );
	window.addEventListener( 'scrollend', mark, { passive: true } );
	mark();
}
