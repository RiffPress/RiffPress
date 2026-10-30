/**
 * Playback: a tap plays in the bar and the lock screen gets its metadata, a reload picks up paused, a link to another page keeps playing, and what a screen reader hears.
 * Runs in desktop Chromium and in Chromium at an iPhone's size; the tests tagged `@smoke` also run in WebKit (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { audioState, playerSite } = require( '../helpers/site' );

const made = own();
let postUrl;

test.beforeAll( async ( { requestUtils } ) => {
	( { postUrl } = await playerSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'Player', () => {
	test.beforeEach( async ( { page } ) => {
		await page.goto( postUrl );
	} );

	test( 'a tap plays the track in the bar and the lock screen gets its metadata', { tag: '@smoke' }, async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect( page.locator( '.riff-bar' ) ).toBeVisible();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Underground'
		);
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( false );
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 0.5 );
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toHaveAttribute(
			'data-playing',
			'true'
		);
		// Its name says which track Pause is for, among rows that all play something.
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toHaveAttribute(
			'aria-label',
			'Pause Underground'
		);
		const session = await page.evaluate( () => ( {
			title: navigator.mediaSession?.metadata?.title,
			state: navigator.mediaSession?.playbackState,
			artwork: navigator.mediaSession?.metadata?.artwork?.length,
		} ) );
		expect( session.title ).toBe( 'Underground' );
		expect( session.state ).toBe( 'playing' );
		expect( session.artwork ).toBeGreaterThan( 0 );
	} );

	test( 'a reload picks up paused where it left off', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 2 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 2 );
		await page.reload();
		await expect( page.locator( '.riff-bar' ) ).toBeVisible();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Trombone Detritus'
		);
		const state = await audioState( page );
		expect( state.paused ).toBe( true );
		expect( state.time ).toBeGreaterThan( 1.5 );
	} );

	test( 'a reload of a long queue keeps the tracks around the one playing', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( false );
		// Six hundred tracks, each the post's first under its own name, playing the 551st.
		await page.evaluate( () => {
			const [ first ] = window.riff.queue();
			const tracks = Array.from( { length: 600 }, ( _, i ) => ( {
				...first,
				id: `url:${ first.src }#${ i + 1 }`,
				title: `Take ${ i + 1 }`,
			} ) );
			window.riff.play( tracks, 550 );
		} );
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Take 551'
		);
		await page.reload();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Take 551'
		);
		const queue = await page.evaluate( () =>
			window.riff.queue().map( ( t ) => t.title )
		);
		expect( queue ).toHaveLength( 500 );
		// The rest after it, and before it as many as make five hundred.
		expect( queue[ 0 ] ).toBe( 'Take 101' );
		expect( queue[ 450 ] ).toBe( 'Take 551' );
		expect( queue.at( -1 ) ).toBe( 'Take 600' );
	} );

	test( 'a link to another page keeps playing', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect
			.poll( async () => ( await audioState( page ) ).time )
			.toBeGreaterThan( 2 );
		// Any same-site link will do; the home page has no tracks of its own.
		await page.evaluate( () => {
			const a = document.createElement( 'a' );
			a.href = '/';
			a.id = 'riff-e2e-link';
			a.textContent = 'Home';
			document.body.prepend( a );
		} );
		await page.locator( '#riff-e2e-link' ).click();
		await page.waitForURL( /\/$/ );
		await expect( page.locator( '.riff-bar' ) ).toBeVisible();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Underground'
		);
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( false );
		expect( ( await audioState( page ) ).time ).toBeGreaterThan( 1.5 );
	} );

	test( 'the first track pressed is announced, and the queue names what each row plays', async ( {
		page,
		isMobile,
	} ) => {
		await page.locator( '.riff-row' ).nth( 1 ).click();
		// Said where a track starts, so the first press is heard as Next and Previous are.
		await expect( page.locator( '#a11y-speak-polite' ) ).toContainText(
			/^Now playing Underground by Airmen of Note/
		);
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '.riff-np' ) ).toBeVisible();
		if ( isMobile ) {
			await page.locator( '.riff-peek' ).click();
		}
		// Each row of Up next is named with its artist, as a post's rows are, rather than its title
		// and artist read run together; the playing one offers Pause.
		const rows = page.locator( '.riff-queue-list li > button:first-child' );
		await expect( rows.nth( 0 ) ).toHaveAttribute( 'aria-label', /^Play Intensities in Ten Cities by Airmen of Note/ );
		await expect( rows.nth( 1 ) ).toHaveAttribute( 'aria-label', /^Pause Underground by Airmen of Note/ );
		await page.evaluate( () => document.querySelectorAll( 'audio, video' ).forEach( ( m ) => m.pause() ) );
		await expect( rows.nth( 1 ) ).toHaveAttribute( 'aria-label', /^Play Underground by/ );
	} );

	// What the polite live region says, in order, from here on.
	const listen = ( page ) =>
		page.evaluate( () => {
			window.said = [];
			const region = document.getElementById( 'a11y-speak-polite' );
			new MutationObserver( () => {
				const text = region.textContent.replace( /\u00a0/g, '' ).trim();
				if ( text && text !== window.said.at( -1 ) ) {
					window.said.push( text );
				}
			} ).observe( region, { childList: true, characterData: true, subtree: true } );
		} );
	const said = ( page ) => page.evaluate( () => window.said );

	test( 'a track that cannot play is said and marked, and the next is only called playing once it plays', async ( {
		page,
	} ) => {
		// The first file asked for is missing; the others play.
		let missing;
		await page.route( '**/*.mp3', ( route ) => {
			missing ??= route.request().url();
			return route.request().url() === missing
				? route.fulfill( { status: 404, body: '' } )
				: route.continue();
		} );
		await listen( page );
		await page.locator( '.riff-row' ).first().click();
		await expect.poll( () => said( page ) ).toContainEqual( 'Couldn’t play Intensities in Ten Cities.' );
		await expect( page.locator( '.riff-row' ).first() ).toHaveAttribute( 'aria-description', 'Couldn’t be played' );
		await expect( page.locator( '.riff-row' ).first().locator( '.riff-row-note' ) ).toBeVisible();
		await expect.poll( () => said( page ) ).toContainEqual( expect.stringMatching( /^Now playing Underground by/ ) );
		const heard = await said( page );
		expect( heard.some( ( m ) => m.startsWith( 'Now playing Intensities' ) ) ).toBe( false );
		expect( heard.indexOf( 'Couldn’t play Intensities in Ten Cities.' ) ).toBeLessThan(
			heard.findIndex( ( m ) => m.startsWith( 'Now playing Underground' ) )
		);
	} );

	test( 'when track after track cannot play, the player stops at the third and says so', async ( { page } ) => {
		await page.route( '**/*.mp3', ( route ) => route.fulfill( { status: 404, body: '' } ) );
		await listen( page );
		await page.locator( '.riff-row' ).first().click();
		await expect.poll( () => said( page ), { timeout: 15_000 } ).toContainEqual( 'These tracks couldn’t be played.' );
		const heard = await said( page );
		expect( heard.filter( ( m ) => m.startsWith( 'Couldn’t play' ) ) ).toHaveLength( 2 );
		expect( heard.some( ( m ) => m.startsWith( 'Now playing' ) ) ).toBe( false );
		await expect( page.locator( '.riff-row[data-failed]' ) ).toHaveCount( 3 );
	} );
} );
