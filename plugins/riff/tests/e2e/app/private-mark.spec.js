/**
 * The Private mark: a track from a post visitors can't see is marked in the Listen app's rows for
 * someone signed in who can see it, said to a screen reader in words, and a visitor gets nothing.
 */
const path = require( 'path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { FIXTURES, FILES, appSite } = require( '../helpers/site' );

const made = own();
let pageUrl;
let title;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl } = await appSite( made, requestUtils ) );
	const media = await made.media( requestUtils, path.join( FIXTURES, FILES[ 0 ] ) );
	title = `Riff private ${ Date.now() }`;
	const post = await made.post( requestUtils, {
		title: 'Riff private e2e',
		status: 'private',
		content: `<!-- wp:audio {"id":${ media.id }} --><figure class="wp-block-audio"><audio controls src="${ media.source_url }"></audio></figure><!-- /wp:audio -->`,
	} );
	await requestUtils.rest( {
		method: 'POST',
		path: `/wp/v2/media/${ media.id }`,
		data: { post: post.id, title },
	} );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test( 'a row from a private post is marked for its owner, in words', async ( { page } ) => {
	await page.goto( `${ pageUrl }${ pageUrl.includes( '?' ) ? '&' : '?' }riff_view=tracks` );
	const row = page.locator( '.riff-row', { hasText: title } ).first();
	await expect( row ).toBeVisible();
	const mark = row.locator( '.riff-row-sub .riff-private' );
	await expect( mark ).toBeVisible();
	await expect( mark.locator( 'svg' ) ).toHaveAttribute( 'aria-hidden', 'true' );
	await expect( mark ).toHaveText( 'Private,' );
	// A track from a published post has none.
	await expect(
		page.locator( '.riff-row', { hasNotText: title } ).first().locator( '.riff-private' )
	).toHaveCount( 0 );
} );

test.describe( 'A visitor', () => {
	test.use( { storageState: { cookies: [], origins: [] } } );

	test( 'sees neither the track nor any mark', async ( { page } ) => {
		await page.goto( `${ pageUrl }${ pageUrl.includes( '?' ) ? '&' : '?' }riff_view=tracks` );
		await expect( page.locator( '.riff-row' ).first() ).toBeVisible();
		await expect( page.locator( '.riff-row', { hasText: title } ) ).toHaveCount( 0 );
		await expect( page.locator( '.riff-private' ) ).toHaveCount( 0 );
	} );
} );
