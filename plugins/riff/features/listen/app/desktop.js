/* Riff's desktop app marks the document riff-desktop, and so does a computer in standalone mode. There
 * is no browser bar to lean on, so a strip across the top holds back and forward at its left end,
 * Home and search in the middle and who is listening at its right (desktop.css). Back and forward
 * come first in the app; on a wide window Home, search and who is listening come first in the
 * sidebar's markup, in that order, so the keyboard reaches the strip left to right before the
 * library. The server draws the sidebar again with each view, so frame() puts them there each time.
 * Internal to the app, not an extension point. */
import { esc } from 'riff-app/helpers';

export function desktopFrame( ctx ) {
	const { app, nav, __ } = ctx;
	const wide = window.matchMedia( '(min-width: 900px)' );

	const icon = ( d ) =>
		`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor"><path d="${ d }"/></svg>`;
	const bar = document.createElement( 'div' );
	bar.className = 'riff-app-titlebar';
	bar.innerHTML = `<div class="riff-app-history" role="group" aria-label="${ esc(
		__( 'History', 'riff' )
	) }"><button type="button" data-riff-app-action="back" aria-label="${ esc(
		__( 'Back', 'riff' )
	) }">${ icon(
		'M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z'
	) }</button><button type="button" data-riff-app-action="forward" aria-label="${ esc(
		__( 'Forward', 'riff' )
	) }">${ icon(
		'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z'
	) }</button></div>`;
	// First in the app, so the buttons and the sidebar after it are holes in its drag region, and
	// the keyboard reaches back and forward first. They stay in the strip, which is never drawn
	// again, so a press that changes the view keeps its focus.
	app.prepend( bar );
	const [ back, forward ] = bar.querySelectorAll( 'button' );
	// The Navigation API knows whether there is anywhere to go; without it both stay enabled.
	const moved = () => {
		back.disabled = ! window.navigation.canGoBack;
		forward.disabled = ! window.navigation.canGoForward;
	};
	if ( window.navigation && 'canGoBack' in window.navigation ) {
		window.navigation.addEventListener( 'currententrychange', moved );
		moved();
	}

	// The strip's controls in the order they are seen: on a wide window first in the sidebar;
	// narrower, where the server put them, Home after the site's name and search and who is
	// listening last.
	function frame() {
		const home = nav?.querySelector( ':scope > .riff-app-home' );
		const search = nav?.querySelector( ':scope > .riff-app-search' );
		const who = nav?.querySelector(
			':scope > :is(.riff-app-account, .riff-app-signin)'
		);
		const field = search?.querySelector( 'input[type="search"]' );
		if ( field ) {
			// A question in the pill, where there is room for it.
			field.placeholder = __( 'Find an album, an artist or a track', 'riff' );
		}
		if ( ! nav ) {
			return;
		}
		// Moving what has the focus loses it, as a window crosses the width while the field is in use.
		const held = document.activeElement;
		if ( wide.matches ) {
			nav.prepend( ...[ home, search, who ].filter( Boolean ) );
		} else {
			const brand = nav.querySelector( ':scope > .riff-app-brand' );
			if ( home && brand ) {
				brand.after( home );
			}
			nav.append( ...[ search, who ].filter( Boolean ) );
		}
		if ( held !== document.activeElement && nav.contains( held ) ) {
			held.focus( { preventScroll: true } );
		}
	}

	frame();
	wide.addEventListener( 'change', frame );
	ctx.sidebar( app.dataset.sidebar !== 'mini', false );
	return { frame };
}
