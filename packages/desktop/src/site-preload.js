/**
 * The site window's preload, and all it does: marks the document as Riff's desktop app, so riff.css
 * lays out the window's top, with room for the traffic lights on a Mac, where the window has no
 * title bar. It exposes nothing to the page.
 */
const classes = [ 'riff-desktop' ];
if ( process.platform === 'darwin' ) {
	classes.push( 'riff-desktop-inset' );
}

const mark = () => document.documentElement.classList.add( ...classes );

// A preload can run before the parser has made <html>.
if ( document.documentElement ) {
	mark();
} else {
	new MutationObserver( ( records, observer ) => {
		if ( document.documentElement ) {
			observer.disconnect();
			mark();
		}
	} ).observe( document, { childList: true } );
}
