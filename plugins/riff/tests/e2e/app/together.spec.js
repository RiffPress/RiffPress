/**
 * Listening together, end to end, in two browsers: what the admin plays shows on another listener's
 * Home under Listening now; pressing it follows them, and each change the admin makes reaches the
 * follower before it is due and is made by both when it is.
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

// Both players at one moment, by each page's clock, which on one machine is one clock: the
// follower's time less where the host's music is by then.
async function apart( host, guest ) {
	const [ h, g ] = await Promise.all(
		[ host, guest ].map( ( p ) =>
			p.evaluate( () => ( {
				time: window.riffInternal.time(),
				wall: performance.timeOrigin + performance.now(),
				playing: window.riffInternal.playing(),
				id: Number( window.riffInternal.current()?.id ),
			} ) )
		)
	);
	const moved = h.playing ? ( g.wall - h.wall ) / 1000 : 0;
	return { host: h, guest: g, off: g.time - ( h.time + moved ) };
}

// Longer than Together::LEAD and a follower's wait between asks, so a change has been made.
const MADE = 3500;

test( 'a follower keeps time with the host through a pause, a play, a skip and a seek, each made when it is due', async ( {
	page,
	browser,
	baseURL,
	isMobile,
} ) => {
	test.skip( isMobile, 'Two listeners at a computer show it; the timing is the same on a phone.' );
	// The admin plays the first track.
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

	const row = guest.locator( '[data-riff-shelf="together"]' );
	const card = row.locator( '.riff-card' );
	// The share leaves a moment after the play; Home asks once it opens.
	await expect( async () => {
		await guest.goto( listenUrl );
		await expect( card ).toHaveCount( 1, { timeout: 3000 } );
	} ).toPass();
	await expect( row.locator( '.riff-shelf-title' ) ).toHaveText( 'Listening now' );
	await expect( card.locator( '.riff-card-title' ) ).toHaveText( 'admin' );
	await expect( card.locator( '.riff-card-sub' ) ).toContainText( 'Underground' );

	await card.hover();
	await card.locator( '.riff-card-play' ).click();
	await expect
		.poll( () => guest.evaluate( () => Number( window.riffInternal?.current()?.id ) ) )
		.toBe( audio[ 0 ].id );
	await expect.poll( () => guest.evaluate( () => window.riffInternal.playing() ) ).toBe( true );
	// Joined where the host's music was by then, which a start takes a moment to reach.
	expect( Math.abs( ( await apart( page, guest ) ).off ) ).toBeLessThan( 0.5 );

	// The host sees who is with them, which is when their presses wait for the moment too.
	await expect( page.locator( '#riff' ).getByText( /with you/ ).first() ).toBeVisible( {
		timeout: 20000,
	} );
	await page.waitForTimeout( 1500 ); // The server's clock, learned.

	// A pause: both stop at the same place.
	await page.evaluate( () => window.riffInternal.toggle() );
	await page.waitForTimeout( MADE );
	let now = await apart( page, guest );
	expect( now.host.playing ).toBe( false );
	expect( now.guest.playing ).toBe( false );
	expect( Math.abs( now.off ) ).toBeLessThan( 0.1 );

	// A play: both start at the same moment, from there.
	await page.evaluate( () => window.riffInternal.toggle() );
	await page.waitForTimeout( MADE );
	now = await apart( page, guest );
	expect( now.host.playing ).toBe( true );
	expect( now.guest.playing ).toBe( true );
	expect( Math.abs( now.off ) ).toBeLessThan( 0.1 );

	// A skip: both start the next track together, from its start.
	await page.evaluate( () => window.riffInternal.next() );
	await page.waitForTimeout( MADE );
	now = await apart( page, guest );
	expect( now.host.id ).toBe( audio[ 1 ].id );
	expect( now.guest.id ).toBe( audio[ 1 ].id );
	expect( Math.abs( now.off ) ).toBeLessThan( 0.1 );

	// A seek: the host's music runs on from there, and the follower meets it when it is due.
	await page.evaluate( () => window.riffInternal.seek( 60 ) );
	await page.waitForTimeout( MADE );
	now = await apart( page, guest );
	expect( now.host.time ).toBeGreaterThan( 60 );
	expect( Math.abs( now.off ) ).toBeLessThan( 0.1 );

	// A press of the follower's own is theirs: they stop following.
	await guest.evaluate( () => window.riffInternal.toggle() );
	await expect( guest.locator( '.riff-toast' ).getByText( /You stopped following admin/ ) ).toBeVisible();

	await context.close();
} );
