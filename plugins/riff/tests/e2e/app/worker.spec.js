/**
 * The app's fonts come with it: preloaded with the page, drawn in the first paint without a swap,
 * and kept by its service worker for every launch after the first.
 * Runs in desktop Chromium (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { appSite } = require( '../helpers/site' );

const made = own();
let appUrl;

test.beforeAll( async ( { requestUtils } ) => {
	const { pageUrl } = await appSite( made, requestUtils );
	appUrl = pageUrl.replace( /\/?$/, '/' ) + 'app/';
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'The app’s fonts', () => {
	test( 'Roboto is preloaded with the page, and nothing moves', async ( { page } ) => {
		// What the page records from its first moment: when it first painted, when Roboto was in,
		// and every shift of the layout.
		await page.addInitScript( () => {
			window.riffFonts = { paint: 0, roboto: 0, shift: 0 };
			new PerformanceObserver( ( list ) => {
				for ( const e of list.getEntries() ) {
					if ( e.name === 'first-contentful-paint' ) {
						window.riffFonts.paint = e.startTime;
					}
				}
			} ).observe( { type: 'paint', buffered: true } );
			new PerformanceObserver( ( list ) => {
				for ( const e of list.getEntries() ) {
					window.riffFonts.shift += e.hadRecentInput ? 0 : e.value;
				}
			} ).observe( { type: 'layout-shift', buffered: true } );
			document.fonts.addEventListener( 'loadingdone', ( e ) => {
				if ( e.fontfaces.some( ( f ) => f.family.replace( /"/g, '' ) === 'Riff Roboto' ) ) {
					window.riffFonts.roboto ||= performance.now();
				}
			} );
		} );
		await page.goto( appUrl );
		await expect(
			page.locator( 'link[rel="preload"][as="font"][href$="assets/fonts/roboto/roboto.woff2"][crossorigin]' )
		).toHaveCount( 1 );
		await page.waitForFunction( () => window.riffFonts.paint > 0 );
		await page.waitForFunction( () => window.riffFonts.roboto > 0 );
		expect( await page.evaluate( () => window.riffFonts.shift ) ).toBe( 0 );
	} );

	test( 'the service worker keeps the fonts and stylesheets, and answers for nothing else', async ( {
		page,
	} ) => {
		await page.goto( appUrl );
		const scope = await page.evaluate( async () => {
			const reg = await navigator.serviceWorker.ready;
			return reg.scope;
		} );
		// The app's address without its last slash, so an app at …/app is inside it too.
		expect( scope ).toBe( new URL( appUrl ).href.replace( /\/$/, '' ) );
		// The worker claims the page once it is active; the next load is answered by it.
		const fromWorker = new Map();
		page.on( 'response', ( r ) => fromWorker.set( r.url(), r.fromServiceWorker() ) );
		await page.reload();
		await page.waitForLoadState( 'load' );
		const roboto = [ ...fromWorker ].find( ( [ url ] ) => url.endsWith( 'roboto/roboto.woff2' ) );
		expect( roboto?.[ 1 ], 'Roboto from the device' ).toBe( true );
		const css = [ ...fromWorker ].find( ( [ url ] ) => /assets\/riff\.css\?ver=/.test( url ) );
		expect( css?.[ 1 ], 'riff.css from the device' ).toBe( true );
		const doc = [ ...fromWorker ].find( ( [ url ] ) => url === appUrl );
		expect( doc?.[ 1 ], 'the page itself from the network' ).toBe( false );

		// Offline, the fonts are still there.
		await page.context().setOffline( true );
		const offline = await page.evaluate( async ( url ) => {
			const r = await fetch( url, { mode: 'cors' } );
			return r.ok;
		}, roboto[ 0 ] );
		await page.context().setOffline( false );
		expect( offline ).toBe( true );
	} );
} );
