/**
 * The queue: a row's menu plays next or adds to the queue, Up next lists the rest of the post and reorders, removes and clears, and next, previous, repeat and shuffle.
 * Runs in desktop Chromium and in Chromium at an iPhone's size; the tests tagged `@smoke` also run in WebKit (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const { own } = require( '../helpers/own' );
const { iosAgent, playerSite } = require( '../helpers/site' );

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

	test( 'the menu on a row plays a track next or adds it to the queue, and Riff\'s own features add to it', async ( {
		page,
	} ) => {
		await page.evaluate( () => {
			window.riffQueueChanges = [];
			window.wp.hooks.addAction( 'riff.queue', 'e2e', ( d ) => window.riffQueueChanges.push( d.change ) );
			window.riffInternal.listen( 'menu', ( items, t ) => [
				...items,
				{ id: 'e2e', label: 'Say hello', run: () => ( window.riffHello = t.title ) },
			] );
		} );
		const titles = () => page.evaluate( () => window.riff.queue().map( ( t ) => t.title ) );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect.poll( titles ).toHaveLength( 3 );

		const third = page.locator( '.riff-track' ).nth( 2 ).locator( '.riff-more-button' );
		await third.click();
		await expect( third ).toHaveAttribute( 'aria-expanded', 'true' );
		const menu = page.locator( '.riff-menu' );
		await expect( menu.getByRole( 'menuitem' ).first() ).toBeFocused();
		await page.keyboard.press( 'Enter' ); // Play next.
		await expect.poll( titles ).toEqual( [ 'Intensities in Ten Cities', 'Trombone Detritus', 'Underground', 'Trombone Detritus' ] );
		await expect( third ).toBeFocused();

		await page.locator( '.riff-track' ).nth( 1 ).locator( '.riff-more-button' ).click();
		await menu.getByRole( 'menuitem', { name: 'Add to queue' } ).click();
		await expect.poll( async () => ( await titles() ).at( -1 ) ).toBe( 'Underground' );

		await page.locator( '.riff-track' ).nth( 0 ).locator( '.riff-more-button' ).click();
		await page.keyboard.press( 'End' );
		await expect( menu.getByRole( 'menuitem', { name: 'Say hello' } ) ).toBeFocused();
		await page.keyboard.press( 'Enter' );
		expect( await page.evaluate( () => window.riffHello ) ).toBe( 'Intensities in Ten Cities' );
		await page.locator( '.riff-track' ).nth( 0 ).locator( '.riff-more-button' ).click();
		await page.keyboard.press( 'Escape' );
		await expect( menu ).toBeHidden();
		expect( await page.evaluate( () => window.riffQueueChanges ) ).toEqual( [ 'next', 'add' ] );
	} );

	test( 'Up next reorders by keyboard and its menu, removes a track, and clears', async ( {
		page,
		isMobile,
	} ) => {
		const titles = () => page.evaluate( () => window.riff.queue().map( ( t ) => t.title ) );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect.poll( titles ).toHaveLength( 3 );
		await page.evaluate( () => window.riff.open() );
		// On a phone, Up next is a sheet pulled up from its handle.
		if ( await page.locator( '.riff-peek' ).isVisible() ) {
			await page.locator( '.riff-peek' ).click();
		}
		const list = page.locator( '.riff-queue-list' );
		await expect( list.locator( 'li' ) ).toHaveCount( 3 );

		// Alt and Up moves the last track above the one before it, and keeps the focus on it. A
		// phone has no keyboard; its menu's Move up does the same.
		if ( isMobile ) {
			await list.locator( 'li' ).nth( 2 ).locator( '.riff-more-button' ).click();
			await page.locator( '.riff-menu' ).getByRole( 'menuitem', { name: 'Move up' } ).click();
		} else {
			await list.locator( 'li' ).nth( 2 ).locator( 'button' ).first().focus();
			await page.keyboard.press( 'Alt+ArrowUp' );
			await expect( list.locator( 'li' ).nth( 1 ).locator( 'button' ).first() ).toBeFocused();
		}
		await expect.poll( titles ).toEqual( [ 'Intensities in Ten Cities', 'Trombone Detritus', 'Underground' ] );
		const said = page.locator( '#a11y-speak-polite' );
		await expect( said ).toHaveText( 'Moved to 2 of 3' );

		await list.locator( 'li' ).nth( 1 ).locator( '.riff-more-button' ).click();
		// The menu opens inside the dialog, where a screen reader kept to it can reach it.
		await expect( page.locator( '.riff-np .riff-menu' ) ).toBeVisible();
		await page.locator( '.riff-menu' ).getByRole( 'menuitem', { name: 'Move down' } ).click();
		await expect.poll( titles ).toEqual( [ 'Intensities in Ten Cities', 'Underground', 'Trombone Detritus' ] );

		await list.locator( 'li' ).nth( 2 ).locator( '.riff-more-button' ).click();
		await page.locator( '.riff-menu' ).getByRole( 'menuitem', { name: 'Remove from queue' } ).click();
		await expect.poll( titles ).toEqual( [ 'Intensities in Ten Cities', 'Underground' ] );
		await expect( said ).toHaveText( 'Removed from the queue' );
		// The list is drawn again on every change; the focus stays in it, on the nearest place left.
		await expect( list.locator( 'li' ).nth( 1 ).locator( '.riff-more-button' ) ).toBeFocused();

		// Picking a track from the keyboard keeps the focus on it as it starts.
		await list.locator( 'li' ).nth( 1 ).locator( 'button' ).first().focus();
		await page.keyboard.press( 'Enter' );
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText( 'Underground' );
		await expect( list.locator( 'li' ).nth( 1 ).locator( 'button' ).first() ).toBeFocused();

		const clear = page.locator( '[data-riff-action="clear-queue"]' );
		await expect( clear ).toBeVisible();
		await clear.focus();
		await page.keyboard.press( 'Enter' );
		await expect.poll( titles ).toEqual( [ 'Underground' ] );
		await expect( clear ).toBeHidden();
		await expect( list.locator( 'li' ).first().locator( 'button' ).first(), 'Clear hides itself and hands on the focus' ).toBeFocused();
		await expect( said ).toHaveText( 'Queue cleared' );
		expect(
			await page.evaluate( () => window.riff.playing() ),
			'the track playing plays on'
		).toBe( true );
	} );

	test( 'up next lists the rest of the post and plays what is picked', { tag: '@smoke' }, async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-bar-info' ).click();
		const list = page.locator( '.riff-queue-list' );
		if ( await page.locator( '.riff-peek' ).isVisible() ) {
			await page.locator( '.riff-peek' ).click();
		}
		await expect( list ).toBeVisible();
		await expect( list.locator( 'li' ) ).toHaveCount( 3 );
		await expect( list.locator( '[aria-current]' ) ).toContainText(
			'Intensities in Ten Cities'
		);
		await expect( list.locator( '[aria-current]' ) ).toHaveAttribute( 'aria-current', 'true' );
		await list.locator( 'li' ).nth( 2 ).locator( 'button' ).first().click();
		await expect( list.locator( '[aria-current]' ) ).toContainText(
			'Trombone Detritus'
		);
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Trombone Detritus'
		);
	} );

	test( 'up next scrolls with a thin dark scrollbar, not the page\'s light one', async ( {
		page,
	} ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		const list = page.locator( '.riff-queue-list' );
		await expect( list ).toHaveCSS( 'scrollbar-width', 'thin' );
		await expect( list ).toHaveCSS( 'color-scheme', 'dark' );
	} );

	test( 'the bars on the current Up next item follow the music, like the row\'s', async ( {
		page,
	}, testInfo ) => {
		test.skip( iosAgent( testInfo ), 'no analyser on iOS' );
		await page.emulateMedia( { reducedMotion: 'no-preference' } );
		await page.reload();
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-live', '' );
		await page.locator( '.riff-bar-info' ).click();
		if ( await page.locator( '.riff-peek' ).isVisible() ) {
			await page.locator( '.riff-peek' ).click();
		}
		const bar = page.locator( '.riff-queue-list [aria-current] .riff-row-state i' ).first();
		await expect( bar ).toBeAttached();
		// A live reading writes a transform each frame; the keyframes are off while it runs.
		await expect
			.poll( () => bar.evaluate( ( b ) => b.style.transform ) )
			.toMatch( /scaleY\(/ );
	} );

	test( 'next, previous, repeat and shuffle', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '.riff-np' ) ).toBeVisible();
		const control = ( action ) =>
			page.locator( `[data-riff-action="${ action }"]:visible` ).first();
		await control( 'next' ).click();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Underground'
		);
		// A screen reader hears the new track, through WordPress's live region, which Now Playing
		// leaves out of what it makes inert.
		const said = page.locator( '#a11y-speak-polite' );
		await expect( said ).toContainText( /^Now playing Underground/ );
		expect( await said.evaluate( ( el ) => !! el.closest( '[inert]' ) ) ).toBe( false );
		await control( 'prev' ).click();
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Intensities in Ten Cities'
		);
		const repeat = control( 'repeat' );
		await expect( repeat ).toHaveAttribute( 'aria-label', 'Repeat off' );
		await repeat.click();
		await expect( repeat ).toHaveAttribute( 'aria-label', 'Repeat all' );
		await repeat.click();
		await expect( repeat ).toHaveAttribute( 'aria-label', 'Repeat one' );
		await expect( repeat ).toHaveAttribute( 'data-repeat', 'one' );
		const shuffle = control( 'shuffle' );
		await shuffle.click();
		await expect( shuffle ).toHaveAttribute( 'aria-pressed', 'true' );
		await expect( page.locator( '.riff-bar .riff-title' ) ).toHaveText(
			'Intensities in Ten Cities',
			{ timeout: 1000 }
		);
	} );
} );
