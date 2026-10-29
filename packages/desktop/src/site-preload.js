/**
 * The site window's preload: marks the document as Riff's desktop app, so riff.css lays out the
 * window's top, with room for the traffic lights on a Mac, where the window has no title bar. It
 * exposes nothing to the page.
 *
 * The rest of the site opens in the window too (the theme's pages, the login, the dashboard), and
 * riff.css is not on those. On a Mac each gets a strip of its own across the top, which drags the
 * window and keeps the traffic lights off the page; the login is drawn in the app's colours, in
 * WordPress's own layout.
 *
 * On the Listen app it also tells the main process two things the page already shows: the track
 * that is playing, for the Dock menu and a notification, and files dropped on the window, for
 * Import Music…. Neither is visible to the page.
 */
const { ipcRenderer, webUtils } = require( 'electron' );

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

// WordPress's login, drawn as a desktop app's sign-in: a card on a grey that fades to black, the
// site's icon and "Sign in to" its name, bold labels over square fields that ring white when
// focused, Remember Me as a switch, and the amber button. WordPress's own markup and fields,
// unchanged; only the look.
const LOGIN = `
body.login {
	min-height: 100vh;
	background: linear-gradient(rgba(255, 255, 255, 0.1), #000 70%) #000;
	color: #fff;
	font: 14px/1.5 system-ui, sans-serif;
}
#login {
	box-sizing: border-box;
	width: min(100% - 32px, 560px);
	margin: 32px auto;
	padding: 48px max(32px, (min(100vw - 32px, 560px) - 324px) / 2) 40px;
	border-radius: 8px;
	background: #121212;
}
.login h1 a {
	width: 56px;
	height: 56px;
	margin: 0 auto 24px;
	border-radius: 12px;
	background-size: cover;
}
.login h1 a.riff-login-wp {
	filter: brightness(0) invert(1);
	background-size: 52px;
}
.riff-login-title {
	margin: 0 0 40px;
	font-size: 32px;
	font-weight: 800;
	line-height: 1.15;
	letter-spacing: -0.03em;
	text-align: center;
	text-wrap: balance;
}
.login form {
	margin: 0;
	padding: 0;
	border: 0;
	background: none;
	box-shadow: none;
	overflow: visible;
}
.login label {
	margin-bottom: 8px;
	color: #fff;
	font-size: 14px;
	font-weight: 700;
}
.login form .input,
.login input[type="text"],
.login input[type="password"],
.login input[type="email"] {
	box-sizing: border-box;
	height: 48px;
	min-height: 48px;
	margin: 0 0 20px;
	padding: 0 14px;
	border: 1px solid #727272;
	border-radius: 4px;
	background: #121212;
	box-shadow: none;
	color: #fff;
	font-size: 16px;
}
.login form .input:hover,
.login input[type="text"]:hover,
.login input[type="password"]:hover {
	border-color: #fff;
}
.login form .input:focus,
.login input[type="text"]:focus,
.login input[type="password"]:focus {
	border-color: #fff;
	box-shadow: inset 0 0 0 1px #fff;
	outline: 0;
}
.login .wp-pwd input[type="password"],
.login .wp-pwd input[type="text"] {
	padding-right: 48px;
}
.login .button.wp-hide-pw,
.login .button.wp-hide-pw:focus {
	height: 48px;
	min-height: 48px;
	right: 4px;
	border: 0;
	background: none;
	box-shadow: none;
	color: #b3b3b3;
}
.login .button.wp-hide-pw .dashicons {
	color: inherit;
	transition: none;
}
.login .button.wp-hide-pw:hover {
	color: #fff;
}
.login .button.wp-hide-pw:focus-visible {
	outline: 2px solid #fff;
	outline-offset: -6px;
}
.login .forgetmenot {
	float: none;
	display: flex;
	align-items: center;
	margin: 4px 0 32px;
}
.login .forgetmenot label {
	display: flex;
	align-items: center;
	gap: 12px;
	margin: 0;
	font-size: 14px;
	font-weight: 400;
	cursor: pointer;
}
.login .forgetmenot .riff-login-help,
.login .forgetmenot .dashicons {
	color: #727272;
}
.login input[type="checkbox"] {
	appearance: none;
	position: relative;
	flex: none;
	width: 34px;
	height: 20px;
	margin: 0;
	border: 0;
	border-radius: 999px;
	background: #727272;
	box-shadow: none;
	cursor: pointer;
}
.login input[type="checkbox"]::before,
.login input[type="checkbox"]:checked::before {
	content: "";
	position: absolute;
	top: 3px;
	left: 3px;
	width: 14px;
	height: 14px;
	margin: 0;
	border-radius: 50%;
	background: #000;
	transition: transform 0.15s;
}
.login input[type="checkbox"]:checked {
	background: #ffb020;
}
.login input[type="checkbox"]:checked::before {
	transform: translateX(14px);
}
.login input[type="checkbox"]:focus-visible {
	outline: 2px solid #fff;
	outline-offset: 2px;
}
.login .submit {
	float: none;
	margin: 0;
}
.login .button-primary,
.login .button-primary:hover,
.login .button-primary:focus,
.login .button-primary:active {
	float: none;
	width: 100%;
	height: 48px;
	min-height: 48px;
	border: 0;
	border-radius: 999px;
	background: #ffb020;
	box-shadow: none;
	color: #000;
	font-size: 16px;
	font-weight: 700;
	text-shadow: none;
	transition: transform 0.1s;
}
.login .button-primary:hover {
	background: #ffc04d;
	transform: scale(1.04);
}
.login .button-primary:active {
	transform: scale(1);
}
.login .button-primary:focus-visible {
	outline: 2px solid #fff;
	outline-offset: 2px;
}
.login #nav,
.login #backtoblog {
	margin: 0;
	padding: 0;
	text-align: center;
	font-size: 14px;
}
.login #nav {
	margin-top: 32px;
	padding-top: 32px;
	border-top: 1px solid #292929;
}
.login #backtoblog {
	margin-top: 12px;
}
.login #nav a {
	color: #fff;
}
.login #backtoblog a,
.login .privacy-policy-page-link a {
	color: #b3b3b3;
}
.login #nav a:hover,
.login #backtoblog a:hover {
	color: #ffb020;
}
.login .message,
.login .notice,
.login #login_error {
	margin: 0 0 24px;
	padding: 12px 16px;
	border: 0;
	border-radius: 4px;
	background: #2a2a2a;
	box-shadow: none;
	color: #fff;
}
.login #login_error {
	background: #e91429;
}
.login #login_error a {
	color: #fff;
}
.login .privacy-policy-page-link {
	margin: 24px 0 0;
}
.login label,
.login .button,
.login #nav,
.login #backtoblog,
.riff-login-title {
	-webkit-user-select: none;
	user-select: none;
}
.login .language-switcher {
	display: none;
}
`;

/**
 * The login's head: the site's icon in place of WordPress's logo, when the site has one (core puts
 * it in the login's head), and "Sign in to" the site's name, from the title core gives the page.
 */
function loginHead() {
	const logo = document.querySelector( '.login h1 a' );
	if ( ! logo ) {
		return;
	}
	const icons = [ ...document.querySelectorAll( 'link[rel~="icon"][href]' ) ];
	const icon =
		icons.find( ( l ) => l.sizes?.value === '192x192' ) || icons.at( -1 );
	if ( icon ) {
		logo.style.backgroundImage = `url("${ icon.href }")`;
	} else {
		logo.classList.add( 'riff-login-wp' );
	}
	// "Log In ‹ Site — WordPress".
	const name = document.title.split( '‹' )[ 1 ]?.split( '—' )[ 0 ].trim();
	if ( name ) {
		const title = document.createElement( 'p' );
		title.className = 'riff-login-title';
		title.textContent = `Sign in to ${ name }`;
		logo.parentElement.after( title );
	}
}

// While files are dragged over the window: the view dims under a line saying where they go.
const DROP = `
html.riff-desktop-dropping::after {
	content: "Drop to import into your site\\2019s library";
	position: fixed;
	inset: 0;
	z-index: 2147483647;
	display: grid;
	place-items: center;
	border: 2px dashed #ffb020;
	border-radius: 12px;
	background: rgb(0 0 0 / 0.72);
	color: #fff;
	font: 700 24px/1.3 system-ui, sans-serif;
	pointer-events: none;
}
`;

/**
 * Tells the main process each time the player's track changes, from the bar's own title and the
 * artist Now Playing shows.
 */
function watchTrack() {
	const title = document.querySelector( '#riff [data-riff-text="title"]' );
	if ( ! title ) {
		return;
	}
	let last = '';
	new MutationObserver( () => {
		const name = title.textContent.trim();
		if ( ! name || name === last ) {
			return;
		}
		last = name;
		const artist = document.querySelector( '#riff [data-riff-text="artist"]' );
		ipcRenderer.send( 'riff:track', {
			title: name,
			artist: artist ? artist.textContent.trim() : '',
		} );
	} ).observe( title, { childList: true, characterData: true, subtree: true } );
}

/**
 * Files and folders dropped on the window go to Import Music…, as if chosen in its dialog.
 */
function dropToImport() {
	const files = ( e ) => e.dataTransfer?.types?.includes( 'Files' );
	const dropping = ( on ) =>
		document.documentElement.classList.toggle( 'riff-desktop-dropping', on );
	let depth = 0;
	document.addEventListener( 'dragenter', ( e ) => {
		if ( files( e ) ) {
			depth++;
			dropping( true );
		}
	} );
	document.addEventListener( 'dragleave', ( e ) => {
		if ( files( e ) && --depth <= 0 ) {
			depth = 0;
			dropping( false );
		}
	} );
	document.addEventListener( 'dragover', ( e ) => {
		if ( files( e ) ) {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'copy';
		}
	} );
	document.addEventListener( 'drop', ( e ) => {
		if ( ! files( e ) ) {
			return;
		}
		e.preventDefault();
		depth = 0;
		dropping( false );
		const paths = [ ...e.dataTransfer.files ]
			.map( ( file ) => webUtils.getPathForFile( file ) )
			.filter( Boolean );
		if ( paths.length ) {
			ipcRenderer.send( 'riff:drop', paths );
		}
	} );
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

window.addEventListener( 'DOMContentLoaded', () => {
	const css = [];
	if ( document.body.classList.contains( 'login' ) ) {
		css.push( LOGIN );
		loginHead();
	}
	if ( mac && ! document.body.classList.contains( 'riff-standalone' ) ) {
		document.documentElement.classList.add( 'riff-desktop-page' );
		css.push( PAGE );
		const strip = document.createElement( 'div' );
		strip.className = 'riff-desktop-strip';
		strip.setAttribute( 'aria-hidden', 'true' );
		document.body.append( strip );
	}
	if ( document.body.classList.contains( 'riff-standalone' ) ) {
		css.push( DROP );
		watchTrack();
		dropToImport();
	}
	if ( css.length ) {
		const style = document.createElement( 'style' );
		style.textContent = css.join( '\n' );
		document.head.append( style );
	}
} );
