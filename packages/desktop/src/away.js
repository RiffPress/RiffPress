/**
 * When the Listen app's window is out of sight: minimised, hidden, or its whole app hidden with
 * ⌘H, which hides every window without telling any of them. The app's own `hide` and `show` say
 * so; a click on the Dock shows the app again, and with it the window.
 */

/**
 * Tells `tell` whether the window is out of sight, on each of its events and the app's.
 *
 * @param {import('node:events').EventEmitter} app  The app, which fires `hide` and `show` on macOS.
 * @param {import('node:events').EventEmitter} win  The window.
 * @param {(out: boolean) => void}             tell Told true when out of sight, false when back.
 * @return {() => void} Stops listening to the app, for a window that is gone.
 */
function watchAway( app, win, tell ) {
	const out = () => tell( true );
	const back = () => tell( false );
	win.on( 'minimize', out );
	win.on( 'hide', out );
	win.on( 'restore', back );
	win.on( 'show', back );
	app.on( 'hide', out );
	app.on( 'show', back );
	return () => {
		app.removeListener( 'hide', out );
		app.removeListener( 'show', back );
	};
}

module.exports = { watchAway };
