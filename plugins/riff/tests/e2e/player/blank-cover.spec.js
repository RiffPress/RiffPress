/**
 * A cover that does not load: the image shows the blank cover drawn in the page, asks for the
 * cover once, and painting the same track again leaves it be. Desktop Chromium.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { FIXTURES } = require( '../helpers/site' );

const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	const media = await made.media( requestUtils, path.join( FIXTURES, '02 - Underground [underground].mp3' ) );
	const post = await made.post( requestUtils, {
		title: `Blank cover e2e ${ Date.now() }`,
		status: 'publish',
		content: `<!-- wp:audio {"id":${ media.id }} --><figure class="wp-block-audio"><audio controls src="${ media.source_url }"></audio></figure><!-- /wp:audio -->`,
	} );
	postUrl = post.link;
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

// Every cover asked for is answered as a web server answers one it has lost.
async function lost( page ) {
	const asked = [];
	await page.route( /[?&]riff-art=/, ( route ) => {
		asked.push( route.request().url() );
		return route.fulfill( { status: 404, body: '' } );
	} );
	return asked;
}

test( 'a cover drawn on the page that does not load asks once and shows the blank', async ( { page } ) => {
	const asked = await lost( page );
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).first().waitFor();

	const missing = '/?riff-art=999999&e2e=lost';
	await page.evaluate( ( src ) => {
		const art = document.createElement( 'span' );
		art.className = 'riff-row-art';
		art.innerHTML = `<img src="${ src }" alt="">`;
		document.getElementById( 'riff' ).append( art );
	}, missing );
	const img = page.locator( '.riff-row-art img[data-riff-missing]' ).last();
	await expect( img ).toHaveAttribute( 'src', /^data:image\/svg\+xml,/ );
	await expect( img ).toHaveAttribute( 'data-riff-missing', missing );
	await expect( img ).toHaveAttribute( 'alt', '' );
	await expect.poll( () => img.evaluate( ( el ) => el.naturalWidth ) ).toBeGreaterThan( 0 );
	await page.waitForTimeout( 500 );
	expect( asked.filter( ( url ) => url.endsWith( 'e2e=lost' ) ) ).toHaveLength( 1 );
} );

test( 'the playing track\'s cover that does not load stays the blank as the player paints', async ( { page } ) => {
	const asked = await lost( page );
	const errors = [];
	page.on( 'pageerror', ( e ) => errors.push( e.message ) );
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).first().click();
	for ( const img of await page.locator( 'img[data-riff-art]' ).all() ) {
		await expect( img ).toHaveAttribute( 'src', /^data:image\/svg\+xml,/ );
		await expect( img ).toHaveAttribute( 'data-riff-missing', /riff-art=/ );
	}
	await page.waitForTimeout( 1000 );

	// Pausing and playing paints the same track again, twice, and asks for nothing.
	const seen = asked.length;
	for ( let i = 0; i < 4; i++ ) {
		await page.keyboard.press( 'k' );
	}
	await page.waitForTimeout( 1000 );
	expect( asked ).toHaveLength( seen );
	await expect( page.locator( '.riff-thumb img' ) ).toHaveAttribute( 'src', /^data:image\/svg\+xml,/ );
	expect( errors ).toEqual( [] );
} );
