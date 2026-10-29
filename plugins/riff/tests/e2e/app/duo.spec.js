/**
 * The Listen app on a folding phone's screens, by their shape: on a short screen, as a folded
 * iPhone Duo's outer screen is (466 by 678), the tabs run down the right edge where iOS keeps its
 * own bars; unfolded (890 by 626), an album opens as a gatefold, the cover on the left page and
 * the tracks on the right. A phone held upright keeps its tabs along the bottom. Runs in desktop
 * Chromium, as a touch screen.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { appSite } = require( '../helpers/site' );

const made = own();
let pageUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl } = await appSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

const app = () => pageUrl.replace( /\/?$/, '/' ) + 'app/';

test.describe( 'Listen app on iPhone Duo', () => {
	test.use( { isMobile: true, hasTouch: true } );

	test.beforeEach( async ( {}, info ) => {
		test.skip( info.project.name !== 'chromium', 'Sizes are set here, on a touch screen.' );
	} );

	test( 'folded, the tabs run down the right edge; a phone keeps them along the bottom', async ( { page } ) => {
		await page.setViewportSize( { width: 466, height: 678 } );
		await page.goto( app() );
		const home = await page.locator( '.riff-app-home' ).boundingBox();
		const library = await page.locator( '.riff-app-tab-library' ).boundingBox();
		expect( home.x + home.width ).toBeCloseTo( 466, 0 );
		expect( library.y ).toBeGreaterThan( home.y );
		expect( library.x ).toBeCloseTo( home.x, 0 );

		await page.setViewportSize( { width: 402, height: 874 } );
		const upright = await page.locator( '.riff-app-home' ).boundingBox();
		expect( upright.y + upright.height ).toBeCloseTo( 874, 0 );
		expect( upright.x ).toBeCloseTo( 0, 0 );
	} );

	test( 'unfolded, an album opens as a gatefold: the cover on the left, the tracks on the right', async ( { page } ) => {
		await page.setViewportSize( { width: 890, height: 626 } );
		await page.goto( app() + '?riff_view=albums' );
		await page
			.locator( '.riff-card[data-riff-album]', { hasText: 'Compositions' } )
			.first()
			.locator( '.riff-card-link' )
			.click();
		const cover = await page.locator( '.riff-album-cover' ).boundingBox();
		const title = await page.locator( '.riff-album-title' ).boundingBox();
		const tracks = await page.locator( '.riff-album-tracks' ).boundingBox();
		expect( cover.x + cover.width ).toBeLessThan( title.x );
		expect( cover.x + cover.width ).toBeLessThan( tracks.x );
		expect( tracks.y ).toBeGreaterThan( title.y );
	} );
} );
