/**
 * The docs' helpers, on every Source page: the sidebar's Menu, "On this page", search and the door
 * switcher, each described where it starts.
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

/*
 * Search: the bar's button, ⌘K or Ctrl+K anywhere, or / outside a field, opens a dialog over the
 * page. It reads search.json (developers-site.js writes it at the host's root) once, when first
 * opened, and matches what is typed against each page's title, its headings and its summary. The
 * arrow keys move between the results and Enter follows one; Escape, or a press outside, closes it
 * and focus goes back to where it was. Without this script the button stays hidden.
 */
const opener = document.querySelector( '.search' );

if ( opener && window.HTMLDialogElement ) {
	const root = new URL( '../', import.meta.url );
	const mac = /Mac|iPhone|iPad/.test( navigator.platform || navigator.userAgent );
	const key = opener.querySelector( '.search-key' );
	if ( key && ! mac ) {
		key.textContent = 'Ctrl K';
	}
	opener.hidden = false;

	const dialog = document.createElement( 'dialog' );
	dialog.className = 'search-dialog';
	dialog.setAttribute( 'aria-label', 'Search the docs' );
	dialog.innerHTML = '<form method="dialog" role="search"><span class="search-icon" aria-hidden="true"></span><label class="screen-reader-text" for="search-q">Search the docs</label><input id="search-q" type="search" placeholder="Search the docs" autocomplete="off" spellcheck="false" enterkeyhint="go"><button class="search-close" type="submit">Close</button></form><ul class="search-results" aria-label="Results"></ul><p class="search-status" role="status"></p>';
	document.body.append( dialog );
	const input = dialog.querySelector( 'input' );
	const results = dialog.querySelector( '.search-results' );
	const status = dialog.querySelector( '.search-status' );
	let index = null;

	const load = () => {
		index =
			index ||
			fetch( new URL( 'search.json', root ) )
				.then( ( r ) => ( r.ok ? r.json() : [] ) )
				.catch( () => [] );
		return index;
	};

	const esc = ( s ) => s.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' ).replace( /"/g, '&quot;' );

	// A page whose title has the words ranks first, then one where a heading has them, then the
	// summary; a title that starts with them ranks over one that only holds them.
	const find = ( pages, q ) => {
		const words = q.toLowerCase().split( /\s+/ ).filter( Boolean );
		const has = ( text ) => words.every( ( w ) => text.toLowerCase().includes( w ) );
		const hits = [];
		for ( const p of pages ) {
			if ( has( p.t ) ) {
				hits.push( { score: p.t.toLowerCase().startsWith( words[ 0 ] ) ? 4 : 3, href: p.u, title: p.t, where: p.d } );
			}
			for ( const [ id, text ] of p.h ) {
				if ( has( text ) ) {
					hits.push( { score: 2, href: `${ p.u }#${ id }`, title: text, where: p.t } );
				}
			}
			if ( ! has( p.t ) && has( p.s ) ) {
				hits.push( { score: 1, href: p.u, title: p.t, where: p.d } );
			}
		}
		return hits.sort( ( a, b ) => b.score - a.score || a.title.length - b.title.length ).slice( 0, 12 );
	};

	const show = async () => {
		const q = input.value.trim();
		if ( ! q ) {
			results.innerHTML = '';
			status.textContent = '';
			return;
		}
		const hits = find( await load(), q );
		if ( input.value.trim() !== q ) {
			return;
		}
		results.innerHTML = hits.map( ( h ) => `<li><a href="${ esc( new URL( h.href, root ).href ) }"><span class="search-title">${ esc( h.title ) }</span>${ h.where ? `<span class="search-where">${ esc( h.where ) }</span>` : '' }</a></li>` ).join( '' );
		status.textContent = hits.length ? `${ hits.length } result${ hits.length === 1 ? '' : 's' }` : `Nothing matches “${ q }”.`;
	};

	const open = () => {
		if ( ! dialog.open ) {
			dialog.showModal();
			load();
		}
		input.select();
	};

	opener.addEventListener( 'click', open );
	input.addEventListener( 'input', show );
	dialog.addEventListener( 'click', ( e ) => {
		// A press on the backdrop, outside the dialog's own box.
		if ( e.target === dialog ) {
			dialog.close();
		}
	} );
	dialog.addEventListener( 'keydown', ( e ) => {
		const found = [ ...results.querySelectorAll( 'a' ) ];
		const at = found.indexOf( document.activeElement );
		// A search field spends its first Escape on clearing itself; here Escape closes.
		if ( e.key === 'Escape' ) {
			e.preventDefault();
			dialog.close();
		} else if ( e.key === 'ArrowDown' || e.key === 'ArrowUp' ) {
			e.preventDefault();
			const next = e.key === 'ArrowDown' ? at + 1 : at - 1;
			( next < 0 ? input : found[ Math.min( next, found.length - 1 ) ] )?.focus();
		} else if ( e.key === 'Enter' && document.activeElement === input && found[ 0 ] ) {
			e.preventDefault();
			found[ 0 ].click();
		}
	} );
	document.addEventListener( 'keydown', ( e ) => {
		const typing = e.target.closest?.( 'input, textarea, select, [contenteditable]' );
		if ( ( e.key === 'k' && ( e.metaKey || e.ctrlKey ) ) || ( e.key === '/' && ! typing && ! dialog.open ) ) {
			e.preventDefault();
			open();
		}
	} );
}

/*
 * The door switcher at the top of the sidebar is a disclosure, so it works without this script;
 * this closes it as a menu closes, on Escape or a press outside it.
 */
const doorSwitch = document.querySelector( '.door-switch' );
if ( doorSwitch ) {
	document.addEventListener( 'click', ( e ) => {
		if ( doorSwitch.open && ! doorSwitch.contains( e.target ) ) {
			doorSwitch.open = false;
		}
	} );
	doorSwitch.addEventListener( 'keydown', ( e ) => {
		if ( e.key === 'Escape' && doorSwitch.open ) {
			doorSwitch.open = false;
			doorSwitch.querySelector( 'summary' ).focus();
		}
	} );
}
