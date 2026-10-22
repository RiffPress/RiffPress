/**
 * Riff for the desktop: a site's standalone Listen page (its address plus app/) in a window of its
 * own.
 *
 * The window is a sandboxed web page, signed in by WordPress's own login, with the cookie kept in a
 * persistent session. Its preload only marks the document as the desktop app's, for riff.css. Only the site's origin loads in it; every other link opens
 * in the default browser. Media keys and the OS's Now Playing come from the page's Media Session,
 * as in a browser. The one local page, the connect form, is served from riff://app/ rather than
 * file://, and its preload is the only bridge to this process.
 */
const path = require( 'node:path' );
const { pathToFileURL } = require( 'node:url' );
const electron = require( 'electron' );
const site = require( './site' );
const updates = require( './updates' );
const { settings } = require( './settings' );

const {
	app,
	BrowserWindow,
	Menu,
	dialog,
	ipcMain,
	net,
	protocol,
	screen,
	session,
	shell,
} = electron;

const PARTITION = 'persist:riff';
const SCHEME = 'riff';
const CONNECT = `${ SCHEME }://app/index.html`;
const CONNECT_FILES = new Set( [ 'index.html', 'connect.css', 'connect.js' ] );
// Permissions the Listen app asks for: full screen for video, and the clipboard for Share.
const PERMISSIONS = new Set( [ 'fullscreen', 'clipboard-sanitized-write' ] );
const BACKGROUND = '#030303';
// Run from source (npm run desktop), not a packaged build.
const DEV = ! app.isPackaged;
const SIX_HOURS = 6 * 60 * 60 * 1000;

protocol.registerSchemesAsPrivileged( [
	{ scheme: SCHEME, privileges: { standard: true, secure: true } },
] );
app.enableSandbox();

let store;
let updater;
let siteWindow = null;
let connectWindow = null;
let quitting = false;

/**
 * The connected site's standalone address, if there is one.
 *
 * @return {string|undefined} Address.
 */
const currentSite = () => store.get( 'site' );

/**
 * Keeps a window on the site: navigation, redirects and new windows to anywhere else go to the
 * default browser instead, and only http(s) and mailto links get that far.
 *
 * @param {Object} contents The window's contents.
 */
function confine( contents ) {
	const outside = ( event, url ) => {
		if ( site.inWindow( url, currentSite() ) ) {
			return;
		}
		event.preventDefault();
		if ( site.isExternal( url ) ) {
			shell.openExternal( url );
		}
	};
	contents.on( 'will-navigate', outside );
	contents.on( 'will-redirect', outside );
	contents.on( 'will-attach-webview', ( event ) => event.preventDefault() );
	contents.setWindowOpenHandler( ( { url } ) => {
		if ( site.isExternal( url ) ) {
			shell.openExternal( url );
		}
		return { action: 'deny' };
	} );
}

/**
 * Restored bounds, when they still land on a display; otherwise the saved size, centred.
 *
 * @return {Object} Bounds for the BrowserWindow constructor.
 */
function savedBounds() {
	const saved = store.get( 'bounds' );
	if ( ! saved || ! saved.width || ! saved.height ) {
		return { width: 1200, height: 800 };
	}
	const onScreen = screen
		.getAllDisplays()
		.some(
			( { workArea: area } ) =>
				saved.x < area.x + area.width &&
				saved.x + saved.width > area.x &&
				saved.y < area.y + area.height &&
				saved.y + saved.height > area.y
		);
	return onScreen ? saved : { width: saved.width, height: saved.height };
}

/**
 * Opens the site's standalone page, in the existing window when there is one.
 *
 * @param {string} url Standalone address.
 */
function openSite( url ) {
	if ( siteWindow ) {
		siteWindow.loadURL( url );
		siteWindow.show();
		return;
	}
	siteWindow = new BrowserWindow( {
		...savedBounds(),
		minWidth: 360,
		minHeight: 480,
		title: 'Riff',
		backgroundColor: BACKGROUND,
		// On a Mac, no title bar: the page's own strip across the top drags the window, with the
		// traffic lights inset in it (riff.css, html.riff-desktop-inset). Elsewhere the native frame.
		...( process.platform === 'darwin'
			? {
					titleBarStyle: 'hidden',
					trafficLightPosition: { x: 20, y: 26 },
				}
			: {} ),
		webPreferences: {
			preload: path.join( __dirname, 'site-preload.js' ),
			partition: PARTITION,
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			webviewTag: false,
			devTools: DEV,
			// Keeps the player's timers running while the window is hidden or minimised.
			backgroundThrottling: false,
		},
	} );
	if ( store.get( 'maximized' ) ) {
		siteWindow.maximize();
	}
	confine( siteWindow.webContents );

	let timer;
	const remember = () => {
		clearTimeout( timer );
		timer = setTimeout( () => {
			if ( siteWindow && ! siteWindow.isDestroyed() ) {
				store.set( 'bounds', siteWindow.getNormalBounds() );
				store.set( 'maximized', siteWindow.isMaximized() );
			}
		}, 500 );
	};
	for ( const event of [ 'resized', 'moved', 'maximize', 'unmaximize' ] ) {
		siteWindow.on( event, remember );
	}

	siteWindow.on( 'close', ( event ) => {
		store.set( 'bounds', siteWindow.getNormalBounds() );
		store.set( 'maximized', siteWindow.isMaximized() );
		// On a Mac, closing the window keeps the music playing, as Music does; the Dock icon brings
		// it back and Quit ends it.
		if ( process.platform === 'darwin' && ! quitting ) {
			event.preventDefault();
			if ( siteWindow.isFullScreen() ) {
				siteWindow.once( 'leave-full-screen', () => siteWindow.hide() );
				siteWindow.setFullScreen( false );
			} else {
				siteWindow.hide();
			}
		}
	} );
	siteWindow.on( 'closed', () => {
		siteWindow = null;
	} );

	siteWindow.webContents.on(
		'did-fail-load',
		async ( event, code, description, failed, isMainFrame ) => {
			// -3 is a navigation replaced by another one, not a failure.
			if ( ! isMainFrame || code === -3 ) {
				return;
			}
			const { response } = await dialog.showMessageBox( siteWindow, {
				type: 'warning',
				message: 'Couldn’t reach your site.',
				detail: `${ new URL( failed ).host }: ${ description }`,
				buttons: [ 'Try Again', 'Change Site…' ],
				defaultId: 0,
			} );
			if ( response === 0 ) {
				siteWindow.loadURL( currentSite() );
			} else {
				openConnect();
			}
		}
	);

	siteWindow.loadURL( url );
}

/**
 * Opens the window that asks for the site's address.
 */
function openConnect() {
	if ( connectWindow ) {
		connectWindow.focus();
		return;
	}
	connectWindow = new BrowserWindow( {
		width: 460,
		height: 400,
		resizable: false,
		maximizable: false,
		fullscreenable: false,
		title: 'Connect to a site',
		backgroundColor: BACKGROUND,
		webPreferences: {
			preload: path.join( __dirname, 'connect', 'preload.js' ),
			contextIsolation: true,
			sandbox: true,
			nodeIntegration: false,
			webviewTag: false,
			devTools: DEV,
		},
	} );
	connectWindow.webContents.on( 'will-navigate', ( event ) =>
		event.preventDefault()
	);
	connectWindow.webContents.setWindowOpenHandler( () => ( {
		action: 'deny',
	} ) );
	connectWindow.on( 'closed', () => {
		connectWindow = null;
	} );
	connectWindow.loadURL( CONNECT );
}

/**
 * Whether an IPC message comes from the connect form, and nowhere else.
 *
 * @param {Object} event Event.
 * @return {boolean} Whether to answer it.
 */
function fromConnect( event ) {
	return Boolean(
		connectWindow &&
		event.sender === connectWindow.webContents &&
		event.senderFrame &&
		event.senderFrame.url.startsWith( `${ SCHEME }://app/` )
	);
}

ipcMain.handle( 'riff:current', ( event ) =>
	fromConnect( event ) ? store.get( 'address' ) || currentSite() || '' : ''
);

ipcMain.handle( 'riff:connect', async ( event, address ) => {
	if ( ! fromConnect( event ) ) {
		return { error: 'invalid' };
	}
	const ses = session.fromPartition( PARTITION );
	const fetch = ( url ) =>
		ses.fetch( url, { signal: AbortSignal.timeout( 15000 ) } );
	try {
		const found = await site.discover( address, fetch );
		store.set( 'address', String( address ).trim() );
		store.set( 'site', found );
		openSite( found );
		if ( connectWindow ) {
			connectWindow.close();
		}
		return {};
	} catch ( error ) {
		return { error: error.code || 'unreachable' };
	}
} );

/**
 * The menu bar: the platform's usual menus, with Change Site and Check for Updates.
 */
function menu() {
	const mac = process.platform === 'darwin';
	const changeSite = {
		id: 'change-site',
		label: 'Change Site…',
		click: openConnect,
	};
	const checkUpdates = {
		id: 'check-updates',
		label: 'Check for Updates…',
		click: () => updater.check( { manual: true } ),
	};
	const template = [
		...( mac
			? [
					{
						role: 'appMenu',
						submenu: [
							{ role: 'about' },
							checkUpdates,
							{ type: 'separator' },
							changeSite,
							{ type: 'separator' },
							{ role: 'services' },
							{ type: 'separator' },
							{ role: 'hide' },
							{ role: 'hideOthers' },
							{ role: 'unhide' },
							{ type: 'separator' },
							{ role: 'quit' },
						],
					},
				]
			: [
					{
						label: '&File',
						submenu: [
							changeSite,
							{ type: 'separator' },
							{ role: 'quit' },
						],
					},
				] ),
		{ role: 'editMenu' },
		{
			label: 'View',
			submenu: [
				{ role: 'reload' },
				// The developer tools only in a build from source; the browser is the other way in.
				...( DEV
					? [ { role: 'forceReload' }, { role: 'toggleDevTools' } ]
					: [] ),
				{ type: 'separator' },
				{ role: 'resetZoom' },
				{ role: 'zoomIn' },
				{ role: 'zoomOut' },
				{ type: 'separator' },
				{ role: 'togglefullscreen' },
			],
		},
		{ role: 'windowMenu' },
		{
			role: 'help',
			submenu: [
				...( mac ? [] : [ checkUpdates, { type: 'separator' } ] ),
				{
					label: 'Riff Website',
					click: () => shell.openExternal( 'https://riffpress.com/' ),
				},
			],
		},
	];
	Menu.setApplicationMenu( Menu.buildFromTemplate( template ) );
}

/**
 * Serves the connect form's three files at riff://app/, and nothing else.
 */
function serveConnect() {
	protocol.handle( SCHEME, ( request ) => {
		const { host, pathname } = new URL( request.url );
		const file = pathname.slice( 1 );
		if ( host !== 'app' || ! CONNECT_FILES.has( file ) ) {
			return new Response( null, { status: 404 } );
		}
		return net.fetch(
			pathToFileURL( path.join( __dirname, 'connect', file ) ).href
		);
	} );
}

/**
 * The window's session answers permission requests from the site only, and only for what the
 * Listen app uses.
 */
function permissions() {
	const ses = session.fromPartition( PARTITION );
	const allowed = ( permission, url ) =>
		PERMISSIONS.has( permission ) && site.inWindow( url, currentSite() );
	ses.setPermissionRequestHandler(
		( contents, permission, callback, details ) =>
			callback(
				allowed(
					permission,
					details.requestingUrl || contents.getURL()
				)
			)
	);
	ses.setPermissionCheckHandler( ( contents, permission, origin ) =>
		allowed( permission, origin )
	);
}

/**
 * From source, with npm run desktop: the local site's Listen page straight away, and a reload
 * whenever a file under RIFF_DESKTOP_WATCH (the plugins) changes.
 *
 * @param {string} address The local site.
 */
async function develop( address ) {
	const ses = session.fromPartition( PARTITION );
	try {
		const url = await site.discover( address, ( u ) => ses.fetch( u ) );
		store.set( 'address', address );
		store.set( 'site', url );
		openSite( url );
	} catch {
		store.set( 'address', address );
		openConnect();
	}
	const watched = process.env.RIFF_DESKTOP_WATCH;
	if ( watched ) {
		let timer;
		require( 'node:fs' ).watch(
			watched,
			{ recursive: true },
			( event, file ) => {
				if ( ! /\.(css|js|php)$/.test( file || '' ) ) {
					return;
				}
				clearTimeout( timer );
				timer = setTimeout(
					() => siteWindow?.webContents.reloadIgnoringCache(),
					200
				);
			}
		);
	}
}

if ( ! app.requestSingleInstanceLock() ) {
	app.quit();
} else {
	app.on( 'second-instance', () => {
		const win = siteWindow || connectWindow;
		if ( win ) {
			if ( win.isMinimized() ) {
				win.restore();
			}
			win.show();
			win.focus();
		}
	} );

	app.whenReady().then( () => {
		store = settings( app.getPath( 'userData' ) );
		updater = updates.setup( electron );
		serveConnect();
		permissions();
		menu();
		// A packaged build has its icon from electron-builder; from source the Dock would show
		// Electron's.
		if ( DEV && process.platform === 'darwin' ) {
			app.dock.setIcon( path.join( __dirname, '..', 'resources', 'icon.png' ) );
		}
		if ( DEV && process.env.RIFF_DESKTOP_SITE ) {
			develop( process.env.RIFF_DESKTOP_SITE );
		} else if ( currentSite() ) {
			openSite( currentSite() );
		} else {
			openConnect();
		}
		if ( app.isPackaged ) {
			setTimeout( () => updater.check(), 10000 );
			setInterval( () => updater.check(), SIX_HOURS );
		}
	} );

	app.on( 'activate', () => {
		if ( siteWindow ) {
			siteWindow.show();
		} else if ( ! connectWindow ) {
			openConnect();
		}
	} );

	app.on( 'before-quit', () => {
		quitting = true;
	} );

	app.on( 'window-all-closed', () => {
		if ( process.platform !== 'darwin' ) {
			app.quit();
		}
	} );
}
