/**
 * Following, end to end, with the host played from the server: Presence Scenes' riff-listening-together
 * scene plays a listener who plays, pauses, plays on, skips and seeks, and one browser follows them.
 * After each, the follower is within 100 ms of where the host's music is, by the server's clock.
 *
 * Needs Presence Scenes beside the Presence API on the tests site; skipped without it.
 */
const path = require( 'node:path' );
const { spawn, spawnSync } = require( 'node:child_process' );
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { FIXTURES } = require( '../helpers/site' );

const FILES = [
	'02 - Underground [underground].mp3',
	'03 - Trombone Detritus [detritus].mp3',
];
const GUEST = { username: 'riff-follow-guest', password: 'password' };
const SCENE = 'riff-listening-together';
// Within a tenth of a second of the host's music, as the plan on #687 asks.
const CLOSE = 0.1;

let scenes = false;
let listenUrl;
let audio;

const made = own();

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

// The scene, through WP-CLI on the tests site; it plays to its end unless stopped.
const wp = ( ...args ) => [ 'wp-env', 'run', 'tests-cli', 'wp', ...args ];

test.beforeAll( async ( { requestUtils } ) => {
	const plugins = await requestUtils.rest( { path: '/wp/v2/plugins' } );
	scenes = plugins.some(
		( p ) =>
			p.plugin.startsWith( 'presence-scenes/' ) && p.status === 'active'
	);
	if ( ! scenes ) {
		return;
	}
	audio = [];
	for ( const file of FILES ) {
		audio.push( await made.media( requestUtils, path.join( FIXTURES, file ) ) );
	}
	await made.post( requestUtils, {
		title: `Riff follow e2e ${ Date.now() }`,
		status: 'publish',
		content: audio
			.map(
				( m ) =>
					`<!-- wp:audio {"id":${ m.id }} --><figure class="wp-block-audio"><audio controls src="${ m.source_url }"></audio></figure><!-- /wp:audio -->`
			)
			.join( '' ),
	} );
	const page = await made.page( requestUtils, {
		title: 'Follow e2e',
		status: 'publish',
		content: '<!-- wp:riff/app {"align":"full"} /-->',
	} );
	listenUrl = page.link;
	await forgetGuest( requestUtils );
	await requestUtils.createUser( {
		...GUEST,
		email: 'riff-follow-guest@example.com',
		roles: [ 'subscriber' ],
	} );
} );

test.afterAll( async ( { requestUtils } ) => {
	if ( ! scenes ) {
		return;
	}
	spawnSync( 'npx', wp( 'presence', 'scene', 'stop' ), { stdio: 'ignore' } );
	await forgetGuest( requestUtils );
	await made.cleanUp( requestUtils );
} );

test( 'a follower keeps within a tenth of a second of the host through a play, pause, skip and seek', async ( {
	browser,
	baseURL,
} ) => {
	test.skip( ! scenes, 'Presence Scenes is not active on the tests site.' );
	test.setTimeout( 180000 );

	const run = spawn( 'npx', wp( 'presence', 'scene', 'run', SCENE ), {
		stdio: 'ignore',
	} );
	const context = await browser.newContext( {
		baseURL,
		storageState: { cookies: [], origins: [] },
	} );
	try {
		const guest = await context.newPage();
		await guest.goto( '/wp-login.php' );
		await guest.locator( '#user_login' ).fill( GUEST.username );
		await guest.locator( '#user_pass' ).fill( GUEST.password );
		await guest.locator( '#wp-submit' ).click();
		await guest.waitForURL( /wp-admin/ );

		// The actor shows under Listening now once the scene has them play.
		const card = guest
			.locator( '[data-riff-shelf="together"] .riff-card' )
			.first();
		await expect( async () => {
			await guest.goto( listenUrl );
			await expect( card ).toBeVisible( { timeout: 3000 } );
		} ).toPass( { timeout: 30000 } );
		const play = card.locator( '.riff-card-play' );
		const host = Number( await play.getAttribute( 'data-riff-user' ) );
		await expect( play ).toHaveAttribute( 'aria-label', /^Follow / );
		await card.hover();
		await play.click();

		// Where the follower is against the host's schedule, read from the server as the follower's
		// own player never is: the host's row, and the time it took to come back, halved. Only
		// once a change is due does it say where the music is; before, the follower is still on
		// the one before, as the host is.
		const where = () =>
			guest.evaluate( async ( user ) => {
				const base = document.querySelector(
					'[data-riff-shelf="together"]'
				).dataset.riffTogether;
				const t0 = performance.now();
				const r = await window.riffInternal.request( `${ base }/${ user }` );
				const t1 = performance.now();
				const l = await r.json();
				const time = window.riffInternal.time();
				const plan =
					Number( l.at ) +
					( l.playing
						? ( Number( l.now ) - Number( l.since ) ) / 1000 +
						  ( t1 - t0 ) / 2000
						: 0 );
				return {
					off: time - plan,
					at: Number( l.at ),
					hostPlaying: !! l.playing,
					hostTrack: String( l.track?.id ),
					track: String( window.riffInternal.current()?.id ),
					playing: window.riffInternal.playing(),
				};
			}, host );
		const settles = ( ok, timeout = 20000 ) =>
			expect
				.poll(
					async () => {
						const w = await where();
						return ok( w ) && Math.abs( w.off ) < CLOSE;
					},
					{ timeout, intervals: [ 500 ] }
				)
				.toBe( true );
		const hostDoes = ( ok, timeout = 40000 ) =>
			expect
				.poll( async () => ok( await where() ), {
					timeout,
					intervals: [ 1000 ],
				} )
				.toBe( true );

		// Play: on the host's track, where they are.
		await settles(
			( w ) =>
				w.playing && w.track === String( audio[ 0 ].id ) && w.hostPlaying
		);
		// Pause.
		await hostDoes( ( w ) => ! w.hostPlaying );
		await settles( ( w ) => ! w.playing && ! w.hostPlaying );
		// Play on.
		await hostDoes( ( w ) => w.hostPlaying );
		await settles( ( w ) => w.playing && w.hostPlaying );
		// Skip.
		await hostDoes( ( w ) => w.hostTrack === String( audio[ 1 ].id ) );
		await settles(
			( w ) => w.playing && w.track === String( audio[ 1 ].id )
		);
		// Seek: the host's music runs on from 30 until the change is due, a moment ahead, so the
		// schedule has it that far on.
		await hostDoes(
			( w ) =>
				w.hostTrack === String( audio[ 1 ].id ) &&
				w.at >= 30 &&
				w.at < 32
		);
		await settles( ( w ) => w.playing && w.track === String( audio[ 1 ].id ) );
	} finally {
		run.kill();
		await context.close();
	}
} );
