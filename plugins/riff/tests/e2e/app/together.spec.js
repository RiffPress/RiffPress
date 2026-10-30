/**
 * Listening together, end to end, in two browsers: what the admin plays shows on another listener's
 * Home under Listening now, and pressing it plays the admin's queue from where they are.
 *
 * Needs the Presence API, which .wp-env.json installs on the tests site.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { FIXTURES } = require( '../helpers/site' );

const FILES = [
	'02 - Underground [underground].mp3',
	'03 - Trombone Detritus [detritus].mp3',
];
const GUEST = { username: 'riff-together-guest', password: 'password' };

let postUrl;
let listenUrl;
let audio;

const made = own();

// The guest, taken out with whatever they left, from this run or one that stopped early.
async function forgetGuest( requestUtils ) {
	const found = await requestUtils.rest( {
		path: '/wp/v2/users',
		params: { search: GUEST.username, context: 'edit' },
	} );
	for ( const user of found.filter( ( u ) => u.username === GUEST.username ) ) {
		await requestUtils.rest( {
			method: 'DELETE',
			path: `/wp/v2/users/${ user.id }`,
			params: { force: true, reassign: 1 },
		} );
	}
}

test.beforeAll( async ( { requestUtils } ) => {
	audio = [];
	for ( const file of FILES ) {
		audio.push( await made.media( requestUtils, path.join( FIXTURES, file ) ) );
	}
	const post = await made.post( requestUtils, {
		title: `Riff together e2e ${ Date.now() }`,
		status: 'publish',
		content: audio
			.map(
				( m ) =>
					`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`
			)
			.join( '' ),
	} );
	postUrl = post.link;
	const page = await made.page( requestUtils, {
		title: 'Together e2e',
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
	listenUrl = page.link;
	await forgetGuest( requestUtils );
	await requestUtils.createUser( {
		...GUEST,
		email: 'riff-together-guest@example.com',
		roles: [ 'subscriber' ],
	} );
} );

test.afterAll( async ( { requestUtils } ) => {
	await requestUtils.rest( { method: 'DELETE', path: '/riff/v1/together' } ).catch( () => {} );
	await forgetGuest( requestUtils );
	await made.cleanUp( requestUtils );
} );

test( 'what one listener plays shows on another\'s Home, and pressing it listens along', async ( {
	page,
	browser,
	baseURL,
} ) => {
	// The admin plays the second track.
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 1 ).click();
	await expect.poll( () => page.evaluate( () => window.riffInternal.playing() ) ).toBe( true );
	// A seek is shared too.
	await page.evaluate( () => window.riffInternal.seek( 20 ) );

	const context = await browser.newContext( {
		baseURL,
		storageState: { cookies: [], origins: [] },
	} );
	const guest = await context.newPage();
	await guest.goto( '/wp-login.php' );
	await guest.locator( '#user_login' ).fill( GUEST.username );
	await guest.locator( '#user_pass' ).fill( GUEST.password );
	await guest.locator( '#wp-submit' ).click();
	await guest.waitForURL( /wp-admin/ );

	const row = guest.locator( '[data-riff-shelf="together"]' );
	const card = row.locator( '.riff-card' );
	// The share leaves a moment after the play; Home asks once it opens.
	await expect( async () => {
		await guest.goto( listenUrl );
		await expect( card ).toHaveCount( 1, { timeout: 3000 } );
	} ).toPass();
	await expect( row.locator( '.riff-shelf-title' ) ).toHaveText( 'Listening now' );
	await expect( card.locator( '.riff-card-title' ) ).toHaveText( 'admin' );
	await expect( card.locator( '.riff-card-sub' ) ).toContainText( 'Trombone Detritus' );

	await card.hover();
	await card.locator( '.riff-card-play' ).click();
	await expect
		.poll( () => guest.evaluate( () => Number( window.riffInternal?.current()?.id ) ) )
		.toBe( audio[ 1 ].id );
	// Where the admin is, past their seek, not the start of the track.
	await expect
		.poll( () => guest.evaluate( () => window.riffInternal.time() ) )
		.toBeGreaterThan( 20 );

	await context.close();
} );
