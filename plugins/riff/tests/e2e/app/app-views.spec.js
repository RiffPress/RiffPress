/**
 * A plugin's view of the Listen app (riff_app_views): listed for someone who may see it, drawn in
 * the app's own panel at ?riff_view=<slug>, told to its script by riff:app_view on arrival and after
 * in-page navigation; and Posts, taken away, gone. The view is the tests site's own
 * (tests/components/riff-components.php), on while riff_test_app_view is.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { appSite } = require( '../helpers/site' );

const made = own();
let pageUrl;

const setting = ( requestUtils, on ) =>
	requestUtils.rest( {
		method: 'POST',
		path: '/wp/v2/settings',
		data: { riff_test_app_view: on },
	} );

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl } = await appSite( made, requestUtils ) );
	await setting( requestUtils, true );
} );

test.afterAll( async ( { requestUtils } ) => {
	await setting( requestUtils, false );
	await made.cleanUp( requestUtils );
} );

test.describe( 'A plugin\'s view of the Listen app', () => {
	test( 'is in the navigation, drawn in the app\'s panel, and its script hears it show', async ( {
		page,
	} ) => {
		const app = pageUrl.replace( /\/?$/, '/' ) + 'app/';
		await page.goto( app );
		const bar = page.locator( '.riff-app-bar' );
		await expect( bar.locator( '.riff-app-tab', { hasText: 'Posts' } ) ).toHaveCount( 0 );
		await expect
			.poll( () => page.evaluate( () => window.riffTestViews || [] ) )
			.toEqual( [ 'home' ] );

		await bar.locator( '.riff-app-tab', { hasText: 'Test view' } ).first().click();
		await expect( page ).toHaveURL( /[?&]riff_view=test-view/ );
		const panel = page.locator( '[data-riff-app-view] [data-riff-app-panel="test-view"]' );
		await expect( panel.locator( '.riff-test-view' ) ).toHaveText( 'Drawn by a plugin.' );
		await expect( page.locator( '[data-riff-app-view] .riff-app-title' ) ).toHaveText( 'Test view' );
		await expect( panel.locator( '.riff-test-view' ) ).toHaveAttribute( 'data-bound', '1' );

		// Opened by its address, it is told on arrival.
		await page.goto( `${ app }?riff_view=test-view` );
		await expect( page.locator( '.riff-test-view' ) ).toHaveAttribute( 'data-bound', '1' );
		// And Posts' address opens Home.
		await page.goto( `${ app }?riff_view=posts` );
		await expect( page.locator( '[data-riff-app-view] .riff-app-title' ).first() ).toHaveText( 'Home' );
	} );

	test.describe( 'for a visitor', () => {
		test.use( { storageState: { cookies: [], origins: [] } } );

		test( 'who may not see it, it is not there', async ( { page } ) => {
			const app = pageUrl.replace( /\/?$/, '/' ) + 'app/';
			await page.goto( `${ app }?riff_view=test-view` );
			await expect( page.locator( '.riff-test-view' ) ).toHaveCount( 0 );
			await expect( page.locator( '.riff-app-tab', { hasText: 'Test view' } ) ).toHaveCount( 0 );
		} );
	} );
} );
