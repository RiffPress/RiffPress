/**
 * The frame, standalone mode where the window has room for the sidebar: the window does not stretch past its ends, and Now Playing is the art alone with Up next a panel beside it.
 * Runs in desktop Chromium and in Chromium at an iPhone's size (see playwright.config.js).
 */
const { test, expect } = require( '@wordpress/e2e-test-utils-playwright' );
const AxeBuilder = require( '@axe-core/playwright' ).default;
const { own } = require( '../helpers/own' );
const { AXE_TAGS, appSite } = require( '../helpers/site' );

const made = own();
let pageUrl;
let postId;

test.beforeAll( async ( { requestUtils } ) => {
	( { pageUrl, postId } = await appSite( made, requestUtils ) );
} );

test.afterAll( async ( { requestUtils } ) => {
	await made.cleanUp( requestUtils );
} );

test.describe( 'Standalone', () => {
	test( 'in the frame the window does not stretch past its ends, and the view keeps its round corners', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'The frame is for a wide window.' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
		// A trackpad's stretch past the top would slide the view in its frame and show a square edge.
		await expect( page.locator( 'html' ) ).toHaveCSS( 'overscroll-behavior-y', 'none' );
		await expect( page.locator( '.riff-app-view' ) ).toHaveCSS( 'border-top-left-radius', '8px' );
	} );

	test( 'in the frame the whole head of the sidebar is the toggle: its name folds the sidebar, and the row in the rail opens it', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'The frame is for a wide window.' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
		await page.evaluate( () => localStorage.removeItem( 'riff-sidebar' ) );
		await page.reload();
		const toggle = page.locator( '.riff-app-collapse' );
		const brand = page.locator( '.riff-app-brand' );
		await expect( toggle ).toHaveAttribute( 'aria-expanded', 'true' );
		expect( ( await brand.boundingBox() ).height ).toBeGreaterThanOrEqual( 40 );

		// The name sits under the toggle's stretched target, so the pointer is put where it is.
		const name = await page.locator( '.riff-app-name' ).boundingBox();
		await page.mouse.move( name.x + name.width / 2, name.y + name.height / 2 );
		await expect( toggle ).toHaveCSS( 'cursor', 'pointer' );
		await expect( page.locator( '.riff-app-name' ) ).toHaveCSS( 'color', await toggle.evaluate( ( el ) => getComputedStyle( el ).color ) );
		await page.mouse.click( name.x + name.width / 2, name.y + name.height / 2 );
		await expect( toggle ).toHaveAttribute( 'aria-expanded', 'false' );

		// A rail's head is the row, not only the icon.
		const row = await brand.boundingBox();
		expect( row.height ).toBeGreaterThanOrEqual( 40 );
		await page.mouse.click( row.x + 2, row.y + row.height - 2 );
		await expect( toggle ).toHaveAttribute( 'aria-expanded', 'true' );
		await page.evaluate( () => localStorage.removeItem( 'riff-sidebar' ) );
	} );

	test( 'a window with a mouse but no room for the sidebar, as a car\'s screen is, keeps the touch layout without the frame, and gains the frame once it widens', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'A mouse is a computer\'s.' );
		await page.setViewportSize( { width: 860, height: 500 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
		await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount( 1 );
		const html = page.locator( 'html' );
		await expect( html ).not.toHaveAttribute( 'data-riff-frame', 'sidebar' );
		await expect( html ).not.toHaveClass( /\briff-frame\b/ );
		await expect( page.locator( '.riff-app-titlebar' ) ).toBeHidden();
		await page.setViewportSize( { width: 1180, height: 680 } );
		await expect( html ).toHaveAttribute( 'data-riff-frame', 'sidebar' );
		await expect( page.locator( '.riff-app-titlebar [data-riff-app-action="back"]' ) ).toBeVisible();
		await page.setViewportSize( { width: 860, height: 500 } );
		await expect( page.locator( '.riff-app-titlebar' ) ).toBeHidden();
	} );

	test( 'on a computer the strip has back, forward, Home and search as one cluster in its middle and who is listening at its right, reached in that order', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'The strip is a computer\'s.' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
		// A window with room for the sidebar is in the frame, whatever points at it.
		await expect( page.locator( 'html' ) ).toHaveAttribute( 'data-riff-frame', 'sidebar' );
		await expect( page.locator( 'html' ) ).toHaveClass( /\briff-frame\b/ );
		const back = page.locator( '.riff-app-titlebar [data-riff-app-action="back"]' );
		const forward = page.locator( '.riff-app-titlebar [data-riff-app-action="forward"]' );
		const home = page.locator( '.riff-app-bar .riff-app-home' );
		const search = page.locator( '.riff-app-bar .riff-app-search input' );
		const who = page.locator( '.riff-app-bar :is(.riff-app-account, .riff-app-signin)' );

		// Back, forward, Home and the pill are one cluster, in that order, on one row, each
		// within a small gap of the last; the account button is clear of it.
		for ( const width of [ 1440, 900 ] ) {
			await page.setViewportSize( { width, height: 900 } );
			const [ b, f, h, s, w ] = await Promise.all( [ back, forward, home, search, who ].map( ( el ) => el.boundingBox() ) );
			const chain = [ b, f, h, s ];
			for ( let i = 1; i < chain.length; i++ ) {
				const gap = chain[ i ].x - ( chain[ i - 1 ].x + chain[ i - 1 ].width );
				expect( gap, `${ width }: control ${ i } follows control ${ i - 1 }` ).toBeGreaterThanOrEqual( 0 );
				expect( gap, `${ width }: control ${ i } follows control ${ i - 1 }` ).toBeLessThanOrEqual( 12 );
				expect( Math.abs( ( chain[ i ].y + chain[ i ].height / 2 ) - ( chain[ 0 ].y + chain[ 0 ].height / 2 ) ) ).toBeLessThanOrEqual( 2 );
			}
			expect( b.x ).toBeGreaterThanOrEqual( 8 );
			expect( w.x ).toBeGreaterThanOrEqual( s.x + s.width );
		}
		await page.setViewportSize( { width: 1440, height: 900 } );
		await expect( search ).toHaveAttribute( 'placeholder', 'Find an album, an artist or a track' );
		// The keyboard reaches them as they are seen: Home, search and who is listening come before
		// the library in the sidebar.
		const order = await page.locator( '.riff-app-bar > *' ).evaluateAll( ( els ) => els.slice( 0, 3 ).map( ( el ) => el.className ) );
		expect( order[ 0 ] ).toContain( 'riff-app-home' );
		expect( order[ 1 ] ).toContain( 'riff-app-search' );
		expect( order[ 2 ] ).toMatch( /riff-app-(account|signin)/ );

		// Nowhere to go yet; a view, then back and forward through the app's own history.
		await expect( back ).toBeDisabled();
		await page.locator( '.riff-app-bar .riff-app-tab', { hasText: 'Albums' } ).click();
		await expect( page ).toHaveURL( /riff_view=albums|\/albums\/?/ );
		await expect( back ).toBeEnabled();
		await back.click();
		await expect( page ).not.toHaveURL( /riff_view=albums|\/albums\/?/ );
		await expect( forward ).toBeEnabled();
		await forward.click();
		await expect( page ).toHaveURL( /riff_view=albums|\/albums\/?/ );
		// The sidebar is drawn again with each view: the strip keeps its order and its question.
		await expect( page.locator( '.riff-app-bar > *' ).first() ).toHaveClass( /riff-app-home/ );
		await expect( search ).toHaveAttribute( 'placeholder', 'Find an album, an artist or a track' );

		// The pill searches.
		await search.fill( 'Underground' );
		await search.press( 'Enter' );
		await expect( page ).toHaveURL( /riff_search=Underground/ );
		expect( ( await new AxeBuilder( { page } ).withTags( AXE_TAGS ).include( '.riff-app-titlebar' ).include( '.riff-app-bar' ).analyze() ).violations ).toEqual( [] );
	} );

	test( 'in the frame, Now Playing is the art alone, and Up next opens beside it', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'The frame is for a wide window.' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + `app/?riff=${ postId }` );
		// A listener who closed About, open by default, so no panel is open until one is opened.
		await page.evaluate( () => localStorage.setItem( 'riff:panel', '' ) );
		await page.locator( '[data-riff-app-action="play"]' ).click();
		await page.locator( '.riff-bar-info' ).click();
		const np = page.locator( '.riff-np' );
		await expect( np ).toBeVisible();

		// The art on its own, square and in the middle, and no panel until one is opened: its own
		// box, before the record moves it aside while the track plays.
		const cover = await page.locator( '.riff-cover' ).evaluate( ( el ) => {
			const at = el.offsetParent.getBoundingClientRect();
			return { x: at.left + el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight };
		} );
		expect( Math.round( cover.width ) ).toBe( Math.round( cover.height ) );
		expect( Math.abs( cover.x + ( cover.width / 2 ) - 720 ) ).toBeLessThanOrEqual( 2 );
		await expect( page.locator( '[data-riff-panel="queue"]' ) ).toBeHidden();

		// Up next is a panel of its own, from its button in the bar: beside Now Playing, from the top,
		// and the art stays in the middle of what is left.
		const upNext = page.locator( '[data-riff-control="queue"]' );
		await upNext.click();
		await expect( upNext ).toHaveAttribute( 'aria-pressed', 'true' );
		const side = page.locator( '.riff-side' );
		await expect( page.locator( '[data-riff-panel="queue"]' ) ).toBeVisible();
		const panel = await side.boundingBox();
		expect( panel.x + panel.width ).toBeGreaterThan( 1400 );
		const room = await np.boundingBox();
		expect( room.x + room.width ).toBeLessThanOrEqual( panel.x + 1 );
		const middle = await page.locator( '.riff-cover' ).evaluate( ( el ) => {
			const at = el.offsetParent.getBoundingClientRect();
			return at.left + el.offsetLeft + ( el.offsetWidth / 2 );
		} );
		expect( Math.abs( middle - ( room.x + ( room.width / 2 ) ) ) ).toBeLessThanOrEqual( 2 );
		expect( ( await new AxeBuilder( { page } ).withTags( AXE_TAGS ).include( '.riff-side' ).analyze() ).violations ).toEqual( [] );
		// The panel stands on Now Playing's wash from the window's top, as Now Playing does, with none
		// of the strip's black above it.
		await expect( side ).toHaveCSS( 'background-image', /gradient/ );
		await expect( side ).toHaveCSS( 'top', '0px' );

		// Pressed again, it closes; Escape still closes Now Playing.
		await upNext.click();
		await expect( side ).toBeHidden();
		await page.keyboard.press( 'Escape' );
		await expect( np ).toBeHidden();

		// Beside the page, with no wash to carry on, the panel is the frame's black.
		await upNext.click();
		await expect( page.locator( '[data-riff-panel="queue"]' ) ).toBeVisible();
		await expect( side ).toHaveCSS( 'background-image', 'none' );
	} );

	test( 'a control in focus has one ring, its own shape, and the round Home button\'s ring is round and no wider than it', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'The strip is a computer\'s.' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/' );
		await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount( 1 );
		const home = page.locator( '.riff-app-bar .riff-app-home' );
		// Focused from the keyboard, as :focus-visible wants.
		await home.focus();
		await page.keyboard.press( 'Shift+Tab' );
		await page.keyboard.press( 'Tab' );
		await expect( home ).toBeFocused();

		// Every control's ring is the token's: Home, search, a tab in the sidebar, an item of it.
		const ring = async ( el ) =>
			el.evaluate( ( node ) => {
				const s = getComputedStyle( node );
				return [ s.outlineStyle, s.outlineWidth, s.outlineOffset ].join( ' ' );
			} );
		expect( await ring( home ) ).toBe( 'solid 2px 2px' );
		for ( const el of [
			page.locator( '.riff-app-bar .riff-app-search input' ),
			page.locator( '.riff-app-bar .riff-app-tab', { hasText: 'Albums' } ),
		] ) {
			await el.focus();
			await page.keyboard.press( 'Shift+Tab' );
			await page.keyboard.press( 'Tab' );
			expect( await ring( el ) ).toBe( 'solid 2px 2px' );
		}

		// The ring drawn round Home is its own box, 2px out and 2px wide, round as it is, with no
		// tail toward the search field: what focus changes, between a picture of the strip around
		// Home with it and one without, is all within that box.
		await home.focus();
		await page.keyboard.press( 'Shift+Tab' );
		const box = await home.boundingBox();
		const clip = { x: box.x - 24, y: Math.max( 0, box.y - 8 ), width: box.width + 96, height: box.height + 16 };
		await page.mouse.move( 0, 899 );
		const before = ( await page.screenshot( { clip } ) ).toString( 'base64' );
		await page.keyboard.press( 'Tab' );
		await expect( home ).toBeFocused();
		const after = ( await page.screenshot( { clip } ) ).toString( 'base64' );
		const inked = await page.evaluate(
			async ( pngs ) => {
				const read = async ( png ) => {
					const img = new Image();
					img.src = `data:image/png;base64,${ png }`;
					await img.decode();
					const c = document.createElement( 'canvas' );
					c.width = img.width;
					c.height = img.height;
					const ctx = c.getContext( '2d' );
					ctx.drawImage( img, 0, 0 );
					return { w: c.width, h: c.height, px: ctx.getImageData( 0, 0, c.width, c.height ).data };
				};
				const [ was, is ] = await Promise.all( pngs.map( read ) );
				const found = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
				for ( let y = 0; y < is.h; y++ ) {
					for ( let x = 0; x < is.w; x++ ) {
						const i = ( y * is.w + x ) * 4;
						const d = Math.abs( was.px[ i ] - is.px[ i ] ) + Math.abs( was.px[ i + 1 ] - is.px[ i + 1 ] ) + Math.abs( was.px[ i + 2 ] - is.px[ i + 2 ] );
						if ( d > 60 ) {
							found.left = Math.min( found.left, x );
							found.top = Math.min( found.top, y );
							found.right = Math.max( found.right, x );
							found.bottom = Math.max( found.bottom, y );
						}
					}
				}
				return found;
			},
			[ before, after ]
		);
		// Device pixels are CSS pixels here (a scale of 1).
		const left = box.x - 4 - clip.x;
		const top = box.y - 4 - clip.y;
		expect( Math.abs( inked.left - left ) ).toBeLessThanOrEqual( 1 );
		expect( Math.abs( inked.top - top ) ).toBeLessThanOrEqual( 1 );
		expect( Math.abs( inked.right - ( left + box.width + 8 - 1 ) ) ).toBeLessThanOrEqual( 1 );
		expect( Math.abs( inked.bottom - ( top + box.height + 8 - 1 ) ) ).toBeLessThanOrEqual( 1 );
		await expect( home ).toHaveCSS( 'border-top-left-radius', '50%' );
	} );
} );
