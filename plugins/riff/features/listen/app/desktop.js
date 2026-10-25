/* Riff's desktop app marks the document riff-desktop. There is no browser around its window, so the
 * top of the view gets a back and forward pair over the app's own history, and the sidebar's toggle
 * sits in the strip across the top (riff.css). Internal to the app, not an extension point. */
import { esc } from 'riff-app/helpers';

export function desktopFrame( ctx ) {
	const { app, __ } = ctx;

	function desktopBar() {
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
		// First in the app, so the buttons and the sidebar after it are holes in its drag region.
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
	}

	desktopBar();
	// Spotify's question in the search pill, where there is room for it.
	const search = app.querySelector( '.riff-app-search input' );
	if ( search ) {
		search.placeholder = __( 'What do you want to play?', 'riff' );
	}
	ctx.sidebar( app.dataset.sidebar !== 'mini', false );
}
