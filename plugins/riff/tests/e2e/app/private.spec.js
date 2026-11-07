/**
 * A private site: a visitor is turned away at every door, someone with an account is not, and it
 * opens again when the owner says.
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { appSite } = require( '../helpers/site' );

const made = own();
let pageUrl;
let postId;
let trackId;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl, postId } = await appSite( made, requestUtils ) );
	trackId = (
		await requestUtils.rest( {
			path: '/wp/v2/media',
			params: { media_type: 'audio', per_page: 1 },
		} )
	)[ 0 ]?.id;
	await requestUtils.rest( {
		method: 'POST',
		path: '/wp/v2/settings',
		data: { riff_private: true },
	} );
} );

test.afterAll( async ( { requestUtils } ) => {
	await requestUtils.rest( {
		method: 'POST',
		path: '/wp/v2/settings',
		data: { riff_private: false },
	} );
	await made.cleanUp( requestUtils );
} );

test.describe( 'A visitor to a private site', () => {
	test.use( { storageState: { cookies: [], origins: [] } } );

	test( 'is turned away from its pages, its covers, its feed and its REST routes', async ( {
		page,
		request,
	} ) => {
		for ( const address of [
			pageUrl,
			`${ pageUrl.replace( /\/?$/, '/' ) }app/`,
			`/?p=${ postId }`,
			`/?riff-art=${ postId }`,
			'/?feed=rss2',
		] ) {
			const response = await request.get( address );
			expect( response.status(), address ).toBe( 403 );
			expect( await response.text(), address ).not.toContain(
				'data-riff-track'
			);
		}
		// A file's own address, which answers before the rest of the site, and tells nothing.
		const file = await request.get( `/?riff-file=${ trackId }`, {
			maxRedirects: 0,
		} );
		expect( file.status() ).toBe( 403 );
		expect( file.headers().location ).toBeUndefined();
		for ( const route of [
			'riff/v1/library',
			'riff/v1/tracks',
			'wp/v2/media',
		] ) {
			expect(
				( await request.get( `/?rest_route=/${ route }` ) ).status(),
				route
			).toBe( 401 );
		}
		await page.goto( pageUrl );
		await expect( page.getByText( 'This site is private.' ) ).toBeVisible();
		await expect(
			page.getByRole( 'link', { name: 'Log in' } )
		).toBeVisible();
	} );
} );

test.describe( 'Someone with an account', () => {
	test( 'reaches it as ever, and Settings › Reading says it is private', async ( {
		page,
		admin,
	} ) => {
		const response = await page.goto(
			pageUrl.replace( /\/?$/, '/' ) + 'app/'
		);
		expect( response.status() ).toBe( 200 );
		await expect( page.locator( '[data-riff-app]' ) ).toBeVisible();
		await admin.visitAdminPage( 'options-reading.php' );
		await expect( page.locator( '#riff_private' ) ).toBeChecked();
		await expect( page.locator( '#blog_public' ) ).toBeChecked();
	} );
} );
