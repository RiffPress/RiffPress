/**
 * The site window's preload: marks the document as Riff's desktop app, so riff.css lays out the
 * window's top, with room for the traffic lights on a Mac, where the window has no title bar. It
 * exposes nothing to the page.
 *
 * The rest of the site opens in the window too (the theme's pages, the login, the dashboard), and
 * riff.css is not on those. On a Mac each gets a strip of its own across the top, which drags the
 * window and keeps the traffic lights off the page; the login is drawn in the app's colours, in
 * WordPress's own layout.
 */
const mac = process.platform === 'darwin';
const classes = [ 'riff-desktop' ];
if ( mac ) {
	classes.push( 'riff-desktop-inset' );
}

// The strip's height: the traffic lights sit 26px down and are 12px tall.
const STRIP = 40;

const PAGE = `
html.riff-desktop-page {
	padding-top: ${ STRIP }px !important;
	box-sizing: border-box;
}
html.riff-desktop-page.wp-toolbar {
	padding-top: ${ STRIP + 32 }px !important;
}
html.riff-desktop-page #wpadminbar {
	top: ${ STRIP }px !important;
}
.riff-desktop-strip {
	position: fixed;
	top: 0;
	right: 0;
	left: 0;
	z-index: 2147483647;
	height: ${ STRIP }px;
	-webkit-app-region: drag;
	app-region: drag;
}
`;

// WordPress's login, as wp-login.php lays it out, in the app's colours: the black frame, the form
// as one of its #121212 panels with 8px corners, and WordPress's own blue for the button.
const LOGIN = `
body.login {
	background: #000;
	color: #fff;
}
.login h1 a {
	filter: brightness(0) invert(1);
}
.login form {
	border: 0;
	border-radius: 8px;
	background: #121212;
	box-shadow: none;
}
.login label,
.login form .forgetmenot label {
	color: #fff;
}
.login input[type="text"],
.login input[type="password"],
.login input[type="email"] {
	border-color: #3c3c3c;
	border-radius: 4px;
	background: #1f1f1f;
	color: #fff;
}
.login input[type="text"]:focus,
.login input[type="password"]:focus,
.login input[type="email"]:focus {
	border-color: #3858e9;
	box-shadow: 0 0 0 1px #3858e9;
}
.login input[type="checkbox"] {
	border-color: #6b6b6b;
	background: #1f1f1f;
}
.login .button.wp-hide-pw .dashicons {
	color: #b3b3b3;
}
.login #nav a,
.login #backtoblog a,
.login .privacy-policy-page-link a {
	color: #b3b3b3;
}
.login #nav a:hover,
.login #backtoblog a:hover {
	color: #fff;
}
.login .message,
.login .notice,
.login #login_error {
	border-radius: 8px;
	background: #121212;
	color: #fff;
}
.login .language-switcher {
	display: none;
}
`;

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

window.addEventListener( 'DOMContentLoaded', () => {
	const css = [];
	if ( document.body.classList.contains( 'login' ) ) {
		css.push( LOGIN );
	}
	if ( mac && ! document.body.classList.contains( 'riff-standalone' ) ) {
		document.documentElement.classList.add( 'riff-desktop-page' );
		css.push( PAGE );
		const strip = document.createElement( 'div' );
		strip.className = 'riff-desktop-strip';
		strip.setAttribute( 'aria-hidden', 'true' );
		document.body.append( strip );
	}
	if ( css.length ) {
		const style = document.createElement( 'style' );
		style.textContent = css.join( '\n' );
		document.head.append( style );
	}
} );
