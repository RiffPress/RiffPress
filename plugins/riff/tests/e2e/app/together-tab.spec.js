/**
 * The session, end to end, in two browsers: while the admin plays, another listener sees their face
 * on the album's page and presses it to follow them; Together in Now Playing then lists who they
 * follow, with Leave, and the admin's lists who is with them. Leaving, the follower's tab shows who
 * else is listening, each with Follow.
 *
 * Needs the Presence API, which .wp-env.json installs on the tests site.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { own } = require( '../helpers/own' );
const { FIXTURES, AXE_TAGS } = require( '../helpers/site' );

const FILES = [
	'02 - Underground [underground].mp3',
	'03 - Trombone Detritus [detritus].mp3',
];
const GUEST = { username: 'riff-together-tab-guest', password: 'password' };

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
		title: `Riff together tab e2e ${ Date.now() }`,
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
		title: 'Together tab e2e',
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
	listenUrl = page.link;
	await forgetGuest( requestUtils );
	await requestUtils.createUser( {
		...GUEST,
		email: 'riff-together-tab-guest@example.com',
		roles: [ 'subscriber' ],
	} );
} );

test.afterAll( async ( { requestUtils } ) => {
	await requestUtils.rest( { method: 'DELETE', path: '/riff/v1/together' } ).catch( () => {} );
	await forgetGuest( requestUtils );
	await made.cleanUp( requestUtils );
} );

// Now Playing on the Together tab.
async function together( page ) {
	await page.evaluate( () => window.riff.open() );
	await expect( page.locator( '.riff-np' ) ).toBeVisible();
	await page.locator( '.riff-tab[data-riff-tab="together"]' ).click();
	const panel = page.locator( '[data-riff-panel="together"]' );
	await expect( panel ).toBeVisible();
	return panel;
}

test( 'a listener follows another from the faces on an album, and Together lists the session with Leave', async ( {
	page,
	browser,
	baseURL,
	isMobile,
} ) => {
	test.skip( isMobile, 'Two listeners at a computer show it; a phone has the same tab in its sheet.' );
	// The admin plays the first track, from the fixtures' album.
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await expect.poll( () => page.evaluate( () => window.riffInternal.playing() ) ).toBe( true );

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

	// The album's page, by its card.
	await guest.goto( listenUrl );
	await guest.locator( '.riff-app-tab', { hasText: 'Albums' } ).click();
	await guest
		.locator( '.riff-card[data-riff-album]', { hasText: 'Compositions' } )
		.first()
		.locator( '.riff-card-link' )
		.click();
	await expect( guest ).toHaveURL( /riff_album=\d+/ );
	const albumUrl = guest.url();

	// The admin's face beside Play and Shuffle; the share leaves a moment after the play.
	const face = guest.locator( '.riff-album-together .riff-album-face' );
	await expect( async () => {
		await guest.goto( albumUrl );
		await expect( face ).toHaveCount( 1, { timeout: 3000 } );
	} ).toPass();
	await expect( face ).toHaveAccessibleName( 'Follow admin' );
	await expect( guest.locator( '.riff-album-together-label' ) ).toHaveText( 'Listening now' );

	await face.click();
	await expect
		.poll( () => guest.evaluate( () => Number( window.riffInternal?.current()?.id ) ) )
		.toBe( audio[ 0 ].id );

	// The follower's tab: who they follow, and the way out.
	const mine = await together( guest );
	await expect( mine.locator( '.riff-together-head' ) ).toHaveText( 'Following admin' );
	await expect( mine.locator( '.riff-together-person' ) ).toHaveCount( 1 );
	await expect( mine.locator( '.riff-together-person' ) ).toContainText( 'admin' );
	await expect( mine.locator( '.riff-together-person' ) ).toContainText( 'Choosing the music' );
	const leave = mine.getByRole( 'button', { name: 'Leave' } );
	await expect( leave ).toBeVisible();
	expect(
		( await new AxeBuilder( { page: guest } ).withTags( AXE_TAGS ).include( '[data-riff-panel="together"]' ).analyze() ).violations
	).toEqual( [] );

	// The admin's tab: who is with them, asked for while they play.
	const theirs = await together( page );
	await expect( theirs.locator( '.riff-together-head' ) ).toHaveText( 'Listening with you', {
		timeout: 20000,
	} );
	await expect( theirs.locator( '.riff-together-person' ) ).toContainText( GUEST.username );

	// Leaving: out of the session, and the tab shows who else is listening, each with Follow.
	await leave.click();
	await expect( guest.locator( '.riff-toast' ).getByText( /You stopped following admin/ ) ).toBeVisible();
	await expect( mine.locator( '.riff-together-head' ) ).toHaveText( 'Listening now' );
	await expect( mine.getByRole( 'button', { name: 'Follow admin' } ) ).toBeVisible();
	await expect( mine ).toBeFocused();

	await context.close();
} );
