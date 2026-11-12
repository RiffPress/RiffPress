/**
 * The session, end to end, in two browsers: while the admin plays, another listener sees their face
 * on the album's page and presses it to follow them; the Together panel beside the page then lists
 * who they follow, with Leave, and the admin's lists who is with them. Leaving, the follower's panel
 * shows who else is listening, each with Follow.
 *
 * Needs the Presence API, which .wp-env.json installs on the tests site.
 */
const path = require( 'node:path' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { own } = require( '../helpers/own' );
const { openView } = require( '../helpers/views' );
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

// The Together panel, from its button in the bar.
async function together( page ) {
	return openView( page, 'together' );
}

test( 'a listener follows another from the faces on an album, and Together lists the session with Leave', async ( {
	page,
	browser,
	baseURL,
	isMobile,
} ) => {
	test.skip( isMobile, 'Two listeners at a computer show it; a phone has the same panel over the page.' );
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
	await expect( face ).toHaveAccessibleName( 'Listen along with admin' );
	await expect( guest.locator( '.riff-album-together-label' ) ).toHaveText( 'Listening now' );

	await face.click();
	await expect
		.poll( () => guest.evaluate( () => Number( window.riffInternal?.current()?.id ) ) )
		.toBe( audio[ 0 ].id );

	// The follower's panel: who they follow, and the way out.
	const mine = await together( guest );
	await expect( mine.locator( '.riff-together-head' ) ).toHaveText( 'Listening along with admin' );
	await expect( mine.locator( '.riff-together-person' ) ).toHaveCount( 1 );
	await expect( mine.locator( '.riff-together-person' ) ).toContainText( 'admin' );
	await expect( mine.locator( '.riff-together-person' ) ).toContainText( 'Choosing the music' );
	const leave = mine.getByRole( 'button', { name: 'Leave' } );
	await expect( leave ).toBeVisible();
	expect(
		( await new AxeBuilder( { page: guest } ).withTags( AXE_TAGS ).include( '[data-riff-panel="together"]' ).analyze() ).violations
	).toEqual( [] );

	// The admin's panel: who is with them, asked for while they play.
	const theirs = await together( page );
	await expect( theirs.locator( '.riff-together-head' ) ).toHaveText( 'Listening with you', {
		timeout: 20000,
	} );
	await expect( theirs.locator( '.riff-together-person' ) ).toContainText( GUEST.username );

	// Leaving: out of the session, and the panel shows who else is listening, each with Follow.
	await leave.click();
	await expect( guest.locator( '.riff-toast' ).getByText( /You stopped listening along with admin/ ) ).toBeVisible();
	await expect( mine.locator( '.riff-together-head' ) ).toHaveText( 'Listening now' );
	await expect( mine.getByRole( 'button', { name: 'Listen along with admin' } ) ).toBeVisible();
	await expect( guest.locator( '.riff-side-title' ) ).toBeFocused();

	await context.close();
} );

test( 'listeners a host adds from elsewhere show under their own heading, each linking to listen along', async ( {
	page,
} ) => {
	const along = 'https://amy.example/listen/?riff-along=7';
	// As riff_together_elsewhere would give them, and Riff hands them on.
	const amy = {
		id: 7,
		name: 'Amy',
		avatar: null,
		track: { title: 'Underground', artist: 'Chris Zabriskie', art: '', url: '' },
		site: { name: 'Amy’s Riff', url: 'https://amy.example/' },
		playing: true,
		at: Math.floor( Date.now() / 1000 ),
		along,
		when: 'now',
		card: `<div class="riff-card"><span class="riff-card-art"><span class="riff-card-mark" aria-hidden="true">A</span></span><a class="riff-card-link" href="${ along }"><span class="riff-card-title">Amy</span></a><span class="riff-card-sub">Underground · Chris Zabriskie · Amy’s Riff · now</span></div>`,
	};
	await page.route(
		( u ) => /riff\/v1\/together\/?$/.test( decodeURIComponent( u.pathname + ( u.searchParams.get( 'rest_route' ) || '' ) ) ),
		async ( route ) => {
			const response = await route.fetch();
			const body = await response.json();
			if ( route.request().method() === 'GET' && body.changed !== false && ! new URL( route.request().url() ).searchParams.has( 'album' ) ) {
				body.elsewhere = [ amy ];
				body.elsewhere_label = 'Friends';
				body.version = `${ body.version }-friends`;
			}
			await route.fulfill( { response, json: body } );
		}
	);

	// Home: a row of its own, after Listening now.
	await page.goto( listenUrl );
	const shelf = page.locator( '[data-riff-shelf="together-elsewhere"]' );
	await expect( shelf ).toBeVisible();
	await expect( shelf.locator( '.riff-card-link' ) ).toHaveAttribute( 'href', along );
	await expect( shelf.locator( '.riff-card-sub' ) ).toHaveText( 'Underground · Chris Zabriskie · Amy’s Riff · now' );
	await expect( shelf.locator( '.riff-card-play' ) ).toHaveCount( 0 );

	// The Together panel: under the heading the host names, with a link, not Follow.
	await page.goto( postUrl );
	await page.locator( '.riff-row' ).nth( 0 ).click();
	await together( page );
	const panel = page.locator( '[data-riff-panel="together"]' );
	await expect( panel.getByRole( 'heading', { name: 'Friends' } ) ).toBeVisible();
	const row = panel.locator( '.riff-together-person', { hasText: 'Amy' } );
	await expect( row.locator( '.riff-together-initial' ) ).toHaveText( 'A' );
	await expect( row.locator( '.riff-together-sub' ) ).toHaveText( 'Underground · Chris Zabriskie · Amy’s Riff · now' );
	await expect( row.getByRole( 'link', { name: 'Listen along with Amy' } ) ).toHaveAttribute( 'href', along );
	await expect( row.getByRole( 'button' ) ).toHaveCount( 0 );
	const { violations } = await new AxeBuilder( { page } ).include( '[data-riff-panel="together"]' ).withTags( AXE_TAGS ).analyze();
	expect( violations ).toEqual( [] );
	await page.unrouteAll( { behavior: 'ignoreErrors' } );
} );
