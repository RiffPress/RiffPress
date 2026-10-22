/**
 * The desktop app against the wp-env tests site: connect, play, stay on the site, and remember it
 * all after a relaunch.
 */
const fs = require( 'node:fs' );
const os = require( 'node:os' );
const path = require( 'node:path' );
const { test, expect, _electron: electron } = require( '@playwright/test' );
const { RequestUtils } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../../../../plugins/riff/tests/e2e/own' );
const { expectTidy } = require( '../../../../plugins/riff/tests/e2e/tidy' );

const BASE = process.env.WP_BASE_URL;
const ROOT = path.join( __dirname, '..', '..' );
const FIXTURES = path.join( ROOT, '..', 'fixtures', 'compositions' );
const TRACK = '02 - Underground [underground].mp3';

/**
 * How to start the app: the unpacked build for this platform when one is in dist/, else the source.
 *
 * @return {Object} Options for _electron.launch().
 */
function app() {
	const builds = {
		darwin: [
			`mac-${ process.arch }/Riff.app/Contents/MacOS/Riff`,
			'mac/Riff.app/Contents/MacOS/Riff',
		],
		win32: [ 'win-unpacked/Riff.exe' ],
		linux: [ 'linux-unpacked/riff' ],
	};
	const build = ( builds[ process.platform ] || [] )
		.map( ( p ) => path.join( ROOT, 'dist', p ) )
		.find( ( p ) => fs.existsSync( p ) );
	return build ? { executablePath: build, args: [] } : { args: [ ROOT ] };
}

const profile = fs.mkdtempSync( path.join( os.tmpdir(), 'riff-desktop-' ) );
const made = own();
let requestUtils;
let pageUrl;
let postId;
let running;

/**
 * Starts the app on the test's profile and remembers it, so afterEach closes it.
 *
 * @return {Promise<import('@playwright/test').ElectronApplication>} The app.
 */
async function launch() {
	const options = app();
	running = await electron.launch( {
		...options,
		args: [ ...options.args, `--user-data-dir=${ profile }` ],
	} );
	return running;
}

/**
 * The site's window, once it shows the standalone page.
 *
 * @param {import('@playwright/test').ElectronApplication} electronApp The app.
 * @return {Promise<import('@playwright/test').Page>} The window.
 */
async function siteWindow( electronApp ) {
	const isSite = ( page ) => page.url().startsWith( BASE );
	const page =
		electronApp.windows().find( isSite ) ||
		( await electronApp.waitForEvent( 'window', { predicate: isSite } ) );
	await expect(
		page.locator( 'body.riff-standalone .riff-app' )
	).toBeVisible();
	return page;
}

test.describe.configure( { mode: 'serial' } );

test.beforeAll( async () => {
	requestUtils = await RequestUtils.setup( {
		baseURL: BASE,
		user: { username: 'admin', password: 'password' },
	} );
	const media = await made.media(
		requestUtils,
		path.join( FIXTURES, TRACK )
	);
	const post = await made.post( requestUtils, {
		title: `Riff desktop e2e ${ Date.now() }`,
		status: 'publish',
		content: `<!-- wp:audio {"id":${ media.id }} --><figure class="wp-block-audio"><audio controls src="${ media.source_url }"></audio></figure><!-- /wp:audio -->`,
	} );
	postId = post.id;
	const page = await made.page( requestUtils, {
		title: 'Listen desktop e2e',
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
	pageUrl = page.link;
} );

test.afterEach( async () => {
	await running?.close();
	running = null;
} );

test.afterAll( async () => {
	await made.cleanUp( requestUtils );
	fs.rmSync( profile, { recursive: true, force: true } );
} );

test( 'connects with the Listen page’s address, opens its app/ page and plays', async () => {
	const electronApp = await launch();
	const connect = await electronApp.firstWindow();
	await expect( connect ).toHaveURL( 'riff://app/index.html' );

	await connect.getByLabel( 'Site address' ).fill( 'http://example.com/' );
	await connect.getByRole( 'button', { name: 'Connect' } ).click();
	await expect( connect.getByRole( 'alert' ) ).toContainText( 'https://' );

	// The address as the browser shows it, without app/.
	await connect.getByLabel( 'Site address' ).fill( pageUrl );
	await connect.getByRole( 'button', { name: 'Connect' } ).click();
	const page = await siteWindow( electronApp );
	expect( page.url() ).toBe( pageUrl.replace( /\/?$/, '/' ) + 'app/' );

	await page
		.locator( `.riff-card-play[data-riff-post="${ postId }"]` )
		.click();
	await expect
		.poll( () =>
			page.evaluate( () => {
				const audio = document.querySelector( '.riff-audio' );
				return ! audio.paused && audio.currentTime > 0.5;
			} )
		)
		.toBe( true );
	// What the OS's Now Playing and the media keys read.
	await expect
		.poll( () =>
			page.evaluate( () => navigator.mediaSession.metadata?.title )
		)
		.toBe( 'Underground' );

	// Hidden, it keeps playing.
	await electronApp.evaluate( ( { BrowserWindow } ) =>
		BrowserWindow.getAllWindows().forEach( ( w ) => w.hide() )
	);
	const before = await page.evaluate(
		() => document.querySelector( '.riff-audio' ).currentTime
	);
	await expect
		.poll( () =>
			page.evaluate(
				() => document.querySelector( '.riff-audio' ).currentTime
			)
		)
		.toBeGreaterThan( before + 1 );
} );

test( 'a link to another site opens in the browser and leaves the window where it was', async () => {
	const electronApp = await launch();
	const page = await siteWindow( electronApp );
	await electronApp.evaluate( ( { shell } ) => {
		globalThis.opened = [];
		shell.openExternal = async ( url ) => globalThis.opened.push( url );
	} );
	const here = page.url();

	await page.evaluate( () => {
		const link = document.createElement( 'a' );
		link.href = 'https://example.org/away';
		link.textContent = 'Away';
		link.id = 'away';
		document.body.prepend( link );
	} );
	// A click through the page, not Playwright's: its own click waits for a navigation that the app
	// never lets start.
	await page.evaluate( () => document.getElementById( 'away' ).click() );
	await page.evaluate( () => window.open( 'https://example.org/popup' ) );
	await page.evaluate( () => {
		window.location.href = 'file:///etc/hosts';
	} );

	await expect
		.poll( () => electronApp.evaluate( () => globalThis.opened ) )
		.toEqual( [ 'https://example.org/away', 'https://example.org/popup' ] );
	expect( page.url() ).toBe( here );
	expect( electronApp.windows() ).toHaveLength( 1 );
} );

test( 'the site and a WordPress login survive a relaunch', async () => {
	let electronApp = await launch();
	let page = await siteWindow( electronApp );
	await page.goto( `${ BASE }/wp-login.php` );
	await page.locator( '#user_login' ).fill( 'admin' );
	await page.locator( '#user_pass' ).fill( 'password' );
	await page.locator( '#rememberme' ).check();
	await page.locator( '#wp-submit' ).click();
	await expect( page ).toHaveURL( /wp-admin/ );
	await electronApp.close();

	electronApp = running = await launch();
	page = await siteWindow( electronApp );
	expect( electronApp.windows() ).toHaveLength( 1 );
	expect( page.url() ).toBe( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
	await page.goto( `${ BASE }/wp-admin/` );
	await expect( page ).toHaveURL( /wp-admin\/$/ );
} );

test( 'Change Site finds a Listen page from the site’s bare address', async () => {
	const electronApp = await launch();
	await siteWindow( electronApp );
	await electronApp.evaluate( ( { Menu } ) =>
		Menu.getApplicationMenu().getMenuItemById( 'change-site' ).click()
	);
	const connect = await electronApp.waitForEvent( 'window', {
		predicate: ( w ) => w.url().startsWith( 'riff://' ),
	} );
	await expect( connect.getByLabel( 'Site address' ) ).toHaveValue( pageUrl );

	// No scheme and no page: https is assumed except on this machine, and the Listen page comes from
	// core's pages route. The oldest one wins, which may be another spec's.
	await connect.getByLabel( 'Site address' ).fill( new URL( BASE ).host );
	await connect.getByRole( 'button', { name: 'Connect' } ).click();
	await connect.waitForEvent( 'close' );
	const page = electronApp
		.windows()
		.find( ( w ) => w.url().startsWith( BASE ) );
	await expect( page ).toHaveURL( /\/app\/$/ );
	await expect(
		page.locator( 'body.riff-standalone .riff-app' )
	).toBeVisible();
} );

/**
 * What a Mac window's traffic lights would cover: anything the listener can press, inside it.
 *
 * @param {import('@playwright/test').Page} page The window.
 * @return {Promise<string[]>} What sits under the lights.
 */
const underLights = ( page ) =>
	page.evaluate( () =>
		[ ...document.querySelectorAll( 'a, button, input, summary' ) ]
			.filter( ( el ) => {
				const r = el.getBoundingClientRect();
				const style = getComputedStyle( el );
				return (
					r.width > 0 &&
					style.visibility !== 'hidden' &&
					r.left < 84 &&
					r.top < 64 &&
					r.bottom > 0
				);
			} )
			.map( ( el ) => el.outerHTML.slice( 0, 80 ) )
	);

test( 'the window’s top: the sidebar toggle, back and forward, and room for the traffic lights', async () => {
	const electronApp = await launch();
	const page = await siteWindow( electronApp );
	await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
	await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount( 1 );
	await expect( page.locator( 'html.riff-desktop' ) ).toHaveCount( 1 );
	// Linux and Windows keep their frame; the Mac layout is checked on every platform all the same.
	await page.evaluate( () =>
		document.documentElement.classList.add( 'riff-desktop-inset' )
	);
	const size = ( width ) =>
		electronApp.evaluate(
			( { BrowserWindow }, w ) =>
				BrowserWindow.getAllWindows()[ 0 ].setContentSize( w, 900 ),
			width
		);
	await size( 1440 );

	const toggle = page.locator( '.riff-app-collapse' );
	const back = page.locator( '[data-riff-app-action="back"]' );
	const forward = page.locator( '[data-riff-app-action="forward"]' );
	await expect( forward ).toBeDisabled();

	// Back and forward move through the app's own views, in place.
	await page.locator( '.riff-app-tab', { hasText: 'Albums' } ).click();
	await expect( page ).toHaveURL( /riff_view=albums/ );
	await page.locator( '.riff-app-tab', { hasText: 'Artists' } ).click();
	await expect( page ).toHaveURL( /riff_view=artists/ );
	await back.click();
	await expect( page ).toHaveURL( /riff_view=albums/ );
	await expect( page.locator( '.riff-app-view h2' ).first() ).toHaveText(
		'Albums'
	);
	await expect( forward ).toBeEnabled();
	await forward.click();
	await expect( page ).toHaveURL( /riff_view=artists/ );
	await expect( forward ).toBeDisabled();

	// The toggle collapses the sidebar to a rail and opens it again, and the choice is kept.
	await expect( toggle ).toHaveAttribute( 'aria-expanded', 'true' );
	await toggle.click();
	await expect( page.locator( '.riff-app' ) ).toHaveAttribute(
		'data-sidebar',
		'mini'
	);
	await expect( toggle ).toHaveAttribute( 'aria-expanded', 'false' );
	expect(
		await page.evaluate( () => localStorage.getItem( 'riff-sidebar' ) )
	).toBe( 'mini' );
	// Collapsed, the toggle stays at the head of the sidebar's panel, under the strip, and back
	// and forward stay beside the traffic lights.
	const collapsed = {
		toggle: await toggle.boundingBox(),
		pill: await page.locator( '.riff-app-history' ).boundingBox(),
	};
	expect( collapsed.toggle.y ).toBeGreaterThanOrEqual( 64 );
	expect( collapsed.pill.x ).toBeGreaterThanOrEqual( 84 );
	expect( await underLights( page ) ).toEqual( [] );
	await toggle.click();
	await expect( page.locator( '.riff-app' ) ).toHaveAttribute(
		'data-sidebar',
		'full'
	);

	// At the widths the tidy suite uses, open and collapsed, nothing sits under the lights.
	for ( const width of [ 1440, 790, 390 ] ) {
		await size( width );
		for ( const state of [ 'full', 'mini' ] ) {
			if (
				( await page
					.locator( '.riff-app' )
					.getAttribute( 'data-sidebar' ) ) !== state
			) {
				await page.evaluate( () =>
					document.querySelector( '.riff-app-collapse' ).click()
				);
			}
			await expect( page.locator( '.riff-app-titlebar' ) ).toBeVisible();
			expect(
				await underLights( page ),
				`${ width }px, ${ state }`
			).toEqual( [] );
			await expectTidy(
				page,
				'.riff-app',
				`desktop, ${ width }px, ${ state }`
			);
		}
	}
	await page.evaluate( () => localStorage.removeItem( 'riff-sidebar' ) );
} );

test( 'the window is laid out as Spotify’s: panels in a black frame, home and search in the strip', async () => {
	const electronApp = await launch();
	const page = await siteWindow( electronApp );
	await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
	await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount( 1 );
	await page.evaluate( () =>
		document.documentElement.classList.add( 'riff-desktop-inset' )
	);
	await electronApp.evaluate( ( { BrowserWindow } ) =>
		BrowserWindow.getAllWindows()[ 0 ].setContentSize( 1440, 900 )
	);
	await expect( page.locator( '.riff-app-titlebar' ) ).toBeVisible();

	const frame = await page.evaluate( () => {
		const box = ( selector ) => {
			const el = document.querySelector( selector );
			const r = el.getBoundingClientRect();
			const style = getComputedStyle( el );
			return {
				x: r.x,
				y: r.y,
				right: r.right,
				bottom: r.bottom,
				width: r.width,
				background: style.backgroundColor,
				radius: style.borderTopLeftRadius,
			};
		};
		const cut = getComputedStyle(
			document.querySelector( '.riff-app' ),
			'::after'
		);
		return {
			width: window.innerWidth,
			strip: box( '.riff-app-titlebar' ),
			side: box( '.riff-app-bar' ),
			view: box( '.riff-app-view' ),
			home: box( '.riff-app-home' ),
			search: box( '.riff-app-search' ),
			cut: { radius: cut.borderTopLeftRadius, position: cut.position },
		};
	} );

	// A black strip 64px tall, and under it two #121212 panels 8px apart and 8px from the edges.
	expect( frame.strip.bottom ).toBe( 64 );
	expect( frame.strip.background ).toBe( 'rgb(0, 0, 0)' );
	expect( frame.side ).toMatchObject( {
		x: 8,
		y: 64,
		width: 280,
		background: 'rgb(18, 18, 18)',
		radius: '8px',
	} );
	expect( frame.view.x ).toBe( frame.side.right + 8 );
	expect( frame.view.right ).toBe( frame.width - 8 );
	expect( frame.view.background ).toBe( 'rgb(18, 18, 18)' );
	// The view's panel is a rounded window in a fixed frame, the page scrolling behind it.
	expect( frame.cut ).toEqual( { radius: '8px', position: 'fixed' } );

	// Home, then search, in the middle of the strip.
	expect( frame.home.bottom ).toBeLessThanOrEqual( 64 );
	expect( frame.search.bottom ).toBeLessThanOrEqual( 64 );
	expect( frame.home.right ).toBeLessThan( frame.search.x );
	expect(
		Math.abs( frame.search.x + frame.search.width / 2 - frame.width / 2 )
	).toBeLessThanOrEqual( 1 );

	// Home is a button in the strip that still goes home; search still searches.
	await page.locator( '.riff-app-tab', { hasText: 'Albums' } ).click();
	await expect( page ).toHaveURL( /riff_view=albums/ );
	await page.locator( '.riff-app-home' ).click();
	await expect( page ).not.toHaveURL( /riff_view=/ );
	await expect( page.locator( '.riff-app-home' ) ).toHaveAccessibleName(
		'Home'
	);
} );
