/**
 * Now Playing: its views, each opened from its button in the bar and taking the whole screen above it (the album, the turntable), closed with Escape or by pressing the button again; the art on its own, square, and the bar held to its measurements on a wide screen, Up next beside it, the art as wide as a phone allows, the Song and Video switch, a contrast theme, and axe.
 * Runs in desktop Chromium and in Chromium at an iPhone's size; the tests tagged `@smoke` also run in WebKit (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { own } = require( '../helpers/own' );
const { AXE_TAGS, systemColours, audioState, playerSite } = require( '../helpers/site' );
const { openView } = require( '../helpers/views' );

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

	test( 'the album\'s button opens Now Playing, which closes with Escape and returns focus', { tag: '@smoke' }, async ( {
		page,
		isMobile,
	} ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		// What plays, at the bar's left, is read and not pressed.
		await page.locator( '.riff-bar-info' ).click();
		await expect( page.locator( '.riff-np' ) ).toBeHidden();
		await openView( page, 'album' );
		const np = page.locator( '.riff-np' );
		await expect( np ).toBeVisible();
		// The album, the cover on its own: the turntable is a view of its own.
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-riff-turntable', 'off' );
		await expect( page.locator( '.riff-bar [data-riff-control="album"]' ) ).toHaveAttribute( 'aria-pressed', 'true' );
		// Modal on a phone, where it covers the bar; beside the bar on a wide screen, where the bar
		// is still how the music is controlled.
		await expect( np ).toHaveAttribute( 'aria-modal', isMobile ? 'true' : 'false' );
		await expect(
			np.locator( '.riff-np-title, .riff-bar-text .riff-title' ).first()
		).toContainText( 'Intensities in Ten Cities' );
		await expect(
			page.locator( 'body > :not(#riff):not(script)' ).first()
		).toHaveAttribute( 'inert', '' );
		// The page under it stays still: no scrolling behind it, no second scrollbar beside it.
		const scrolls = () => page.evaluate( () => getComputedStyle( document.documentElement ).overflowY );
		expect( await scrolls() ).toBe( 'hidden' );
		// Once it has slid over the page, the page is neither styled nor painted, and keeps its
		// place.
		const covered = page.locator( 'body > [data-riff-covered]' ).first();
		await expect( covered ).toHaveCSS( 'content-visibility', 'hidden' );
		const height = () => page.evaluate( () => document.documentElement.scrollHeight );
		const tall = await height();
		await page.keyboard.press( 'Escape' );
		await expect( np ).toBeHidden();
		await expect( page.locator( '[data-riff-covered]' ) ).toHaveCount( 0 );
		expect( await height(), 'the page is as tall as it was' ).toBe( tall );
		await expect( page.locator( '.riff-bar [data-riff-control="album"]' ) ).toBeFocused();
		await expect( page.locator( '.riff-bar [data-riff-control="album"]' ) ).toHaveAttribute( 'aria-pressed', 'false' );
		expect( await scrolls(), 'and scrolls again once it closes' ).not.toBe( 'hidden' );
	} );

	test( 'each view takes the whole screen above the bar, the turntable is the listener\'s to open and is kept, and the open view\'s button goes back', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'the bar holds the views\' buttons on a wide screen' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		const root = page.locator( '#riff' );
		const np = page.locator( '.riff-np' );
		const bar = page.locator( '.riff-bar' );

		await openView( page, 'album' );
		const screen = await np.boundingBox();
		expect( screen.y ).toBeLessThanOrEqual( 1 );
		expect( screen.width ).toBeGreaterThanOrEqual( 1440 - 1 );
		expect( screen.y + screen.height ).toBeLessThanOrEqual( ( await bar.boundingBox() ).y + 1 );
		await expect( root ).not.toHaveAttribute( 'data-riff-deck', 'out' );

		// The turntable: the record out on the deck, playing or not.
		await openView( page, 'turntable' );
		await expect( root ).not.toHaveAttribute( 'data-riff-turntable', 'off' );
		await expect( root ).toHaveAttribute( 'data-riff-deck', 'out' );
		await expect( page.locator( '.riff-bar [data-riff-control="turntable"]' ) ).toHaveAttribute( 'aria-pressed', 'true' );
		await expect( page.locator( '.riff-bar [data-riff-control="album"]' ) ).toHaveAttribute( 'aria-pressed', 'false' );

		// Its button again goes back to the page.
		await page.locator( '.riff-bar [data-riff-control="turntable"]' ).click();
		await expect( np ).toBeHidden();

		// Kept: Now Playing opens to the turntable the listener chose, after a reload too.
		await page.reload();
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await page.evaluate( () => window.riff.open() );
		await expect( root ).toHaveAttribute( 'data-riff-showing', 'turntable' );
		await openView( page, 'album' );
		await page.keyboard.press( 'Escape' );
		await page.evaluate( () => window.riff.open() );
		await expect( root ).toHaveAttribute( 'data-riff-showing', 'album' );
	} );

	test( 'on a wide screen the art stays square and the bar keeps its measurements', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'the wide layout only' );
		// Tall enough that the stage could hold more than 640px of art. The stage is wider than tall,
		// so the sleeve is sized for the sleeve and the turntable side by side, the record's size,
		// and never past the cap.
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'turntable' );
		// The cover's own box, before the record moves it aside while the track plays.
		const size = ( selector ) =>
			page.locator( selector ).evaluate( ( el ) => ( { width: el.offsetWidth, height: el.offsetHeight } ) );
		const cover = await size( '.riff-cover' );
		expect( cover.width ).toBe( cover.height );
		expect( cover ).toEqual( await size( '.riff-record' ) );
		expect( cover.width ).toBeLessThanOrEqual( 640 );
		// Playing, the record is out of its sleeve, to the cover's right.
		await expect
			.poll( async () => {
				const art = await page.locator( '.riff-cover' ).boundingBox();
				const record = await page.locator( '.riff-record' ).boundingBox();
				return record.x + record.width > art.x + art.width;
			} )
			.toBe( true );
		// The track on its own: Up next is a panel of its own, closed until its button opens it,
		// and then beside Now Playing, which makes room for it rather than going under it.
		await expect( page.locator( '.riff-side' ) ).toBeHidden();
		const alone = await page.locator( '.riff-np' ).boundingBox();
		await openView( page, 'queue' );
		await expect( page.locator( '[data-riff-control="queue"]' ) ).toHaveAttribute( 'aria-pressed', 'true' );
		const side = await page.locator( '.riff-side' ).boundingBox();
		const beside = await page.locator( '.riff-np' ).boundingBox();
		expect( beside.width ).toBeLessThan( alone.width );
		expect( beside.x + beside.width ).toBeLessThanOrEqual( side.x + 1 );
		expect( side.y + side.height ).toBeLessThanOrEqual( ( await page.locator( '.riff-bar' ).boundingBox() ).y + 1 );
		await page.locator( '[data-riff-control="queue"]' ).click();
		await expect( page.locator( '.riff-side' ) ).toBeHidden();
		const colors = await page.evaluate( () => ( {
			repeat: getComputedStyle(
				document.querySelector(
					'.riff-bar [data-riff-action="repeat"]'
				)
			).color,
			open: getComputedStyle(
				document.querySelector( '.riff-bar [data-riff-control="turntable"]' )
			).color,
		} ) );
		expect( colors.repeat ).toBe( 'rgb(144, 144, 144)' );
		expect( colors.open, 'the open view\'s button is lit' ).toBe( 'rgb(255, 255, 255)' );
		const seek = await page.locator( '.riff-bar-seek' ).boundingBox();
		await page.mouse.move( seek.x + 300, seek.y + seek.height / 2 );
		// The knob is a rail as wide as the line, slid by transform, with a 14px dot at its end.
		const knob = await page.locator( '.riff-knob' ).boundingBox();
		const dot = await page.locator( '.riff-knob' ).evaluate( ( el ) => {
			const after = getComputedStyle( el, '::after' );
			return { width: after.width, height: after.height };
		} );
		expect( dot ).toEqual( { width: '14px', height: '14px' } );
		await expect( page.locator( '.riff-knob' ) ).toHaveCSS( 'opacity', '1' );
		// The seek line sits under the transport, inside the bar, with a time at each end.
		const bar = await page.locator( '.riff-bar' ).boundingBox();
		const play = await page.locator( '.riff-bar .riff-play' ).boundingBox();
		expect( seek.y ).toBeGreaterThanOrEqual( play.y + play.height );
		expect( knob.y ).toBeGreaterThanOrEqual( bar.y );
		expect( seek.y + seek.height ).toBeLessThanOrEqual( bar.y + bar.height );
		const times = page.locator( '.riff-bar .riff-time' );
		expect( ( await times.nth( 0 ).boundingBox() ).x ).toBeLessThan( seek.x );
		expect( ( await times.nth( 1 ).boundingBox() ).x ).toBeGreaterThan( seek.x + seek.width - 1 );
	} );

	test( 'on a phone the art is as wide as the screen allows, and Up next opens over it from its chip', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( ! isMobile, 'the phone layout only' );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		const cover = page.locator( '.riff-np .riff-cover' );
		await expect( cover ).toBeVisible();
		// Up next is its own thing, not under the art.
		await expect( page.locator( '.riff-queue-head' ) ).toBeHidden();
		// A short phone keeps most of its width for the art, and everything still fits on the
		// screen once Now Playing has slid up.
		const short = page.viewportSize();
		expect( await cover.evaluate( ( el ) => el.offsetWidth ) ).toBeGreaterThanOrEqual( short.width * 0.6 );
		await expect
			.poll( async () => {
				const chips = await page.locator( '.riff-np .riff-chips' ).boundingBox();
				return chips.y + chips.height;
			} )
			.toBeLessThanOrEqual( short.height + 1 );
		// A tall one, as YouTube Music draws it: the art 24px from either edge, the title under its edge.
		await page.setViewportSize( { width: 390, height: 844 } );
		await expect.poll( () => cover.evaluate( ( el ) => el.offsetWidth ) ).toBe( 390 - 48 );
		const art = await cover.boundingBox();
		const title = await page.locator( '.riff-np-title' ).boundingBox();
		expect( Math.abs( title.x - art.x ) ).toBeLessThanOrEqual( 1 );
		// Over everything, Now Playing too, as a dialog named for it; Close takes it away and focus
		// goes back to its chip.
		await page.locator( '.riff-chips [data-riff-chip="queue"]' ).click();
		const side = page.locator( '.riff-side' );
		await expect( side ).toHaveAttribute( 'role', 'dialog' );
		await expect( side ).toHaveAttribute( 'aria-modal', 'true' );
		await expect( page.locator( '.riff-queue-head' ) ).toBeVisible();
		await expect( page.locator( '.riff-side-title' ) ).toBeFocused();
		expect( await side.boundingBox() ).toEqual( { x: 0, y: 0, width: 390, height: 844 } );
		await page.getByRole( 'button', { name: 'Close Up next' } ).click();
		await expect( side ).toBeHidden();
		await expect( page.locator( '.riff-chips [data-riff-chip="queue"]' ) ).toBeFocused();
	} );

	test( 'a song with a video opens as the video, the song keeps its place, and the choice is kept', async ( {
		page,
		context,
		baseURL,
	} ) => {
		// As on any site but the tests site, where the song comes first (tests/components).
		await context.addCookies( [ { name: 'riff_test_video_first', value: '1', url: baseURL } ] );
		await page.reload();
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '.riff-modes' ) ).toBeVisible();
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-mode', 'video' );
		await expect
			.poll( async () => ( await audioState( page ) ).videoTime )
			.toBeGreaterThan( 1 );
		const before = await audioState( page );
		expect( before.videoPaused ).toBe( false );
		await page.locator( '[data-riff-mode="song"]' ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-mode', 'song' );
		await expect
			.poll( async () => ( await audioState( page ) ).paused )
			.toBe( false );
		const after = await audioState( page );
		expect( after.videoPaused ).toBe( true );
		expect( after.time ).toBeGreaterThanOrEqual( before.videoTime - 0.5 );
		// The listener chose the song: the next song with a video opens as the song.
		await page.keyboard.press( 'Escape' );
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await expect( page.locator( '#riff' ) ).toHaveAttribute( 'data-mode', 'song' );
	} );

	test( 'a track without a video has no switch', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 2 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '.riff-modes' ) ).toBeHidden();
	} );

	test( 'in a contrast theme the seek line, the current track and an open panel\'s button still show', async ( { page, isMobile } ) => {
		await page.emulateMedia( { forcedColors: 'active' } );
		await page.locator( '.riff-row' ).nth( 1 ).click();
		await expect( page.locator( '.riff-row' ).nth( 1 ) ).toHaveAttribute( 'data-current', '' );
		// The line is a background, which a contrast theme would otherwise paint over.
		const line = page.locator( '.riff-bar .riff-line' );
		const player = await systemColours( page.locator( '.riff-bar' ) );
		await expect( line ).toHaveCSS( 'background-color', player.gray );
		await expect( line.locator( '> i:first-child' ) ).toHaveCSS( 'background-color', player.highlight );
		await expect( line.locator( '.riff-hot' ) ).toBeHidden();
		// What plays is marked as the system marks a selection, not by a shade it would drop.
		const row = page.locator( '.riff-row' ).nth( 1 );
		const post = await systemColours( row.locator( '..' ) );
		await expect( row ).toHaveCSS( 'background-color', post.highlight );
		// A phone's bar keeps to the track, Play and the album; its other views open from Now
		// Playing's chips.
		if ( isMobile ) {
			return;
		}
		await openView( page, 'queue' );
		const button = page.locator( '[data-riff-control="queue"]' );
		await expect( button ).toHaveCSS( 'outline-style', 'solid' );
		await expect( button ).toHaveCSS( 'outline-width', '2px' );
	} );

	test( 'Now Playing has no accessibility violations', async ( { page } ) => {
		await page.locator( '.riff-row' ).nth( 0 ).click();
		await openView( page, 'album' );
		await expect( page.locator( '.riff-np' ) ).toBeVisible();
		const results = await new AxeBuilder( { page } ).withTags( AXE_TAGS )
			.include( '#riff' )
			.analyze();
		expect( results.violations ).toEqual( [] );
	} );
} );
