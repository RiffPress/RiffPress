/**
 * The Listen app at the site's own address, once the site asks for it: the home page is the app,
 * its manifest answers and starts there, the Listen page's app/ address moves there, and the
 * Listen page itself keeps the theme.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { appSite } = require( '../helpers/site' );

const made = own();

const setting = ( requestUtils, on ) =>
	requestUtils.rest( {
		method: 'POST',
		path: '/wp/v2/settings',
		data: { riff_app_at_root: on },
	} );

test.beforeAll( async ( { requestUtils } ) => {
	await appSite( made, requestUtils );
	await setting( requestUtils, true );
} );

test.afterAll( async ( { requestUtils } ) => {
	await setting( requestUtils, false );
	await made.cleanUp( requestUtils );
} );

test.describe( 'The Listen app at the site\'s address', () => {
	test( 'the home page is the app, and its app/ address moves there', async ( {
		page,
		request,
		baseURL,
	} ) => {
		const root = new URL( '/', baseURL ).href;
		await page.goto( '/' );
		await expect( page.locator( 'body.riff-standalone' ) ).toBeVisible();
		await expect( page.locator( '[data-riff-app]' ) ).toHaveAttribute( 'data-riff-page', root );
		await expect( page.locator( '#wpadminbar' ) ).toHaveCount( 0 );

		const manifest = await page.locator( 'link[rel="manifest"]' ).getAttribute( 'href' );
		const answer = await request.get( manifest );
		expect( answer.status() ).toBe( 200 );
		expect( answer.headers()[ 'content-type' ] ).toContain( 'application/manifest+json' );
		const json = await answer.json();
		expect( json.start_url ).toBe( root );
		expect( json.scope ).toBe( root );
		expect( json.id ).toBe( root );

		// A view stays at the site's address.
		await page.locator( '.riff-app-tab', { hasText: 'Albums' } ).first().click();
		await expect( page ).toHaveURL( /\/\?riff_view=albums$/ );

		// The Listen page the home page opens is the one its canonical link names.
		const listen = await page.locator( 'link[rel="canonical"]' ).getAttribute( 'href' );
		const moved = await request.get( listen.replace( /\/?$/, '/' ) + 'app/?riff_view=albums', {
			maxRedirects: 0,
		} );
		expect( moved.status() ).toBe( 301 );
		expect( moved.headers().location ).toBe( `${ root }?riff_view=albums` );

		// The Listen page itself is in the theme, as before.
		await page.goto( listen );
		await expect( page.locator( 'body.riff-standalone' ) ).toHaveCount( 0 );
		await expect( page.locator( '[data-riff-app]' ) ).toBeVisible();
	} );
} );
