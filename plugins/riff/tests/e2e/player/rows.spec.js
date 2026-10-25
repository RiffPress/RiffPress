/**
 * Rows in a post: the audio blocks become rows, a playlist block becomes rows too, a locked track is shown and never played, and a track with a video carries a film mark.
 * Runs in desktop Chromium and in Chromium at an iPhone's size; the tests tagged `@smoke` also run in WebKit (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { audioState, playerSite } = require( '../helpers/site' );

const made = own();
let postUrl;
let playlistUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { postUrl, playlistUrl } = await playerSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'Player', () => {
	test.beforeEach( async ( { page } ) => {
		await page.goto( postUrl );
	} );

	test( 'the post lists its tracks and the player stays hidden until one plays', async ( {
		page,
	} ) => {
		await expect( page.locator( '.riff-row' ) ).toHaveCount( 3 );
		await expect( page.locator( '.riff-row' ).nth( 0 ) ).toContainText(
			'Intensities in Ten Cities'
		);
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toContainText(
			'Airmen of Note'
		);
		await expect( page.locator( '#riff' ) ).toBeHidden();
		await expect(
			page.locator( '.wp-block-audio audio' ).first()
		).toBeHidden();
	} );

	test( 'a locked track is listed with a lock that leads to unlocking it, and never queued or played', async ( {
		page,
	} ) => {
		// What the server writes for a track riff_can_play refused: its details, no file, and where
		// riff_unlock_url sends the visitor.
		await page.evaluate( () => {
			const open = JSON.parse(
				document.querySelector( 'figure[data-riff-track]' ).dataset.riffTrack
			);
			const fig = document.createElement( 'figure' );
			fig.className = 'wp-block-audio riff-track';
			fig.dataset.riffTrack = JSON.stringify( {
				...open,
				id: 'locked-1',
				title: 'Members Only',
				src: '',
				video: null,
				locked: true,
				unlock: 'https://example.org/join/',
			} );
			fig.innerHTML = '<audio controls></audio>';
			document
				.querySelector( 'figure[data-riff-track]' )
				.insertAdjacentElement( 'afterend', fig );
			window.riffInternal.mount();
		} );

		const locked = page.locator( '.riff-row-locked' );
		await expect( locked ).toHaveCount( 1 );
		await expect( locked ).toContainText( 'Members Only' );
		await expect( locked ).toHaveAttribute( 'href', 'https://example.org/join/' );
		await expect( locked ).toHaveAttribute( 'aria-label', 'Unlock Members Only' );
		await expect( locked.locator( '.riff-row-lock' ) ).toBeVisible();

		await page.locator( 'button.riff-row' ).first().click();
		await expect
			.poll( () => page.evaluate( () => window.riff.queue().map( ( t ) => t.id ) ) )
			.toHaveLength( 3 );
		expect(
			await page.evaluate( () => window.riff.queue().some( ( t ) => t.locked ) ),
			'the locked track is not in the queue'
		).toBe( false );

		// The player's own API leaves it out too, and starts at the next track that plays.
		const first = await page.evaluate( () => {
			const tracks = [ ...document.querySelectorAll( 'figure[data-riff-track]' ) ].map(
				( f ) => JSON.parse( f.dataset.riffTrack )
			);
			const at = tracks.findIndex( ( t ) => t.locked );
			window.riff.play( tracks, at );
			return tracks[ at + 1 ].id;
		} );
		await expect.poll( () => page.evaluate( () => window.riff.current()?.id ) ).toBe( first );
	} );

	test( 'a playlist block is rows too, played through the one player, with its own player kept off', async ( {
		page,
	} ) => {
		await page.goto( playlistUrl );
		// Before 7.1 the track blocks are unknown to WordPress and render as nothing.
		test.skip(
			( await page.locator( '.wp-block-playlist-track' ).count() ) === 0,
			'The playlist block arrived in WordPress 7.1.'
		);
		const rows = page.locator( '.wp-block-playlist .riff-row' );
		await expect( rows ).toHaveCount( 3 );
		await expect( rows.nth( 2 ) ).toContainText( 'Trombone Detritus' );
		// Core's player markup is there, but neither it nor its track buttons show, and the player
		// never starts, so the file is not fetched to draw a waveform.
		await expect(
			page.locator( '.wp-block-playlist__waveform-player' )
		).toBeAttached();
		await expect(
			page.locator( '.wp-block-playlist__waveform-player' )
		).toBeHidden();
		await expect(
			page.locator( '.wp-block-playlist-track__button' ).first()
		).toBeHidden();
		await expect(
			page.locator( '.wp-block-playlist__waveform-player canvas' )
		).toHaveCount( 0 );

		await rows.nth( 1 ).click();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Underground'
		);
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( false );
		await expect( page.locator( '.riff-queue-list li' ) ).toHaveCount( 3 );
	} );

	test( 'a track with a video carries a film mark by its title, nothing on the right', async ( {
		page,
	} ) => {
		const first = page.locator( '.riff-row' ).nth( 0 );
		await expect(
			first.locator( '.riff-row-title .riff-row-video' )
		).toHaveAttribute( 'aria-label', 'Video' );
		await expect( first.locator( '.riff-row-badge' ) ).toHaveCount( 0 );
		await expect(
			page.locator( '.riff-row' ).nth( 1 ).locator( '.riff-row-video' )
		).toHaveCount( 0 );
	} );
} );
