/**
 * The menus: a track's … and the account menu are drawn as WordPress's toolbar draws its own, and the account menu still closes as a menu after the view changes.
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
	test( 'the … menu and the account menu are drawn as WordPress\'s toolbar draws its menus', async ( {
		page,
	} ) => {
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + `app/?riff=${ postId }` );
		const look = ( locator ) =>
			locator.evaluate( ( el ) => {
				const style = getComputedStyle( el );
				return { background: style.backgroundColor, radius: style.borderTopLeftRadius };
			} );
		const toolbar = { background: 'rgb(44, 51, 56)', radius: '0px' };
		const ivory = 'rgb(242, 234, 219)';

		// It opens before anything has played, while the player itself is still hidden.
		await page.locator( '.riff-track' ).first().locator( '.riff-more-button' ).click();
		const menu = page.locator( '.riff-menu:not([hidden])' );
		await expect( menu ).toBeVisible();
		expect( ( await menu.boundingBox() ).height ).toBeGreaterThan( 0 );
		expect( await look( menu ) ).toEqual( toolbar );
		const item = menu.getByRole( 'menuitem' ).first();
		await item.hover();
		await expect( item ).toHaveCSS( 'color', ivory );
		await page.keyboard.press( 'Escape' );

		await page.locator( '.riff-app-account summary' ).click();
		const account = page.locator( '.riff-app-account-menu' );
		await expect( account ).toBeVisible();
		expect( await look( account ) ).toEqual( toolbar );
		const link = account.locator( 'a' ).first();
		await link.hover();
		await expect( link ).toHaveCSS( 'color', ivory );
		expect( ( await new AxeBuilder( { page } ).withTags( AXE_TAGS ).include( '.riff-app-account' ).analyze() ).violations ).toEqual( [] );
	} );

	test( 'the account menu opens over the view, and still closes as a menu after the view changes', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'the wide layout, where the menu is pinned over the view' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + 'app/?riff_view=albums' );
		await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount( 1 );
		const account = page.locator( '.riff-app-account' );
		await account.locator( 'summary' ).click();
		const signOut = account.getByRole( 'link', { name: 'Sign out' } );
		await expect( signOut ).toBeVisible();
		// The sticky sidebar stacks on its own; the menu inside it must still be on top of the view.
		const box = await signOut.boundingBox();
		expect(
			await page.evaluate(
				( { x, y } ) => !! document.elementFromPoint( x, y )?.closest( '.riff-app-account-menu' ),
				{ x: box.x + box.width / 2, y: box.y + box.height / 2 }
			),
			'Sign out is the thing under the pointer'
		).toBe( true );
		await page.keyboard.press( 'Escape' );
		await expect( account ).not.toHaveAttribute( 'open' );

		// A view arrives in place with its own bar, and the menu in it closes as the first did.
		await page.locator( '.riff-app-tab', { hasText: 'Artists' } ).click();
		await expect( page.locator( '.riff-app-tab[aria-current="page"]' ) ).toHaveText( 'Artists' );
		await page.locator( '.riff-app-account summary' ).click();
		await expect( page.locator( '.riff-app-account' ) ).toHaveAttribute( 'open', '' );
		await page.keyboard.press( 'Escape' );
		await expect( page.locator( '.riff-app-account' ) ).not.toHaveAttribute( 'open' );
		await expect( page.locator( '.riff-app-account summary' ) ).toBeFocused();
	} );

	test( 'in a wide browser tab, where the desktop frame is drawn too, Go to post is a plain link that takes the tab', async ( {
		page,
		isMobile,
	} ) => {
		test.skip( isMobile, 'The frame is a computer\'s.' );
		await page.setViewportSize( { width: 1440, height: 900 } );
		await page.goto( pageUrl.replace( /\/?$/, '/' ) + `app/?riff=${ postId }` );
		await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount( 1 );
		await expect( page.locator( 'html' ) ).toHaveClass( /\briff-desktop\b/ );
		await expect( page.locator( 'html' ) ).not.toHaveClass( /\briff-desktop-app\b/ );
		await page.locator( '.riff-track' ).first().locator( '.riff-more-button' ).click();
		const item = page.locator( '.riff-menu:not([hidden])' ).getByRole( 'menuitem', { name: /^Go to post/ } );
		await expect( item ).toHaveAccessibleName( 'Go to post' );
		await expect( item ).not.toHaveAttribute( 'target' );
		await expect( item.locator( 'svg' ) ).toHaveCount( 0 );
	} );

	test( 'Go to post opens the post in a new window in the desktop app and installed, with WordPress\'s icon and the words a screen reader needs', async ( {
		context,
	} ) => {
		const app = pageUrl.replace( /\/?$/, '/' ) + `app/?riff=${ postId }`;
		// The app in a page of its own, with what marks its window before its scripts run.
		const open = async ( before ) => {
			const page = await context.newPage();
			await page.addInitScript( before );
			await page.goto( app );
			await expect( page.locator( '[data-riff-app-ready]' ) ).toHaveCount( 1 );
			await page.locator( '.riff-track' ).first().locator( '.riff-more-button' ).click();
			return page;
		};
		const newWindow = async ( page ) => {
			const item = page
				.locator( '.riff-menu:not([hidden])' )
				.getByRole( 'menuitem', { name: /Go to post.*opens in a new tab/ } );
			await expect( item ).toHaveAccessibleName( 'Go to post (opens in a new tab)' );
			await expect( item ).toHaveAttribute( 'target', '_blank' );
			await expect( item ).toHaveAttribute( 'rel', 'noopener' );
			await expect( item.locator( 'svg[aria-hidden="true"]' ) ).toBeVisible();
			// The icon is drawn in the words' colour, a little taller than their letters.
			const { height, fill, size, color } = await item.evaluate( ( el ) => {
				const icon = el.querySelector( 'svg' );
				return {
					height: icon.getBoundingClientRect().height,
					fill: getComputedStyle( icon ).fill,
					size: parseFloat( getComputedStyle( el ).fontSize ),
					color: getComputedStyle( el ).color,
				};
			} );
			expect( height ).toBeCloseTo( size * 1.25, 0 );
			expect( fill ).toBe( color );
			return item;
		};

		// Riff's desktop app: its preload marks <html> as the parser makes it, before the page's
		// scripts run (site-preload.js). The tests site has no WP_DEBUG, so ?riff_desktop=1 is not
		// there to do it.
		const desktop = await open( () =>
			new MutationObserver( ( records, observer ) => {
				if ( document.documentElement ) {
					observer.disconnect();
					document.documentElement.classList.add( 'riff-desktop' );
				}
			} ).observe( document, { childList: true } )
		);
		await expect( desktop.locator( 'html' ) ).toHaveClass( /\briff-desktop-app\b/ );
		await newWindow( desktop );
		await desktop.close();

		// Installed as an app of its own. Chromium's emulation has no display-mode, so the page is
		// told it the way it asks.
		const installed = await open( () => {
			const real = window.matchMedia.bind( window );
			window.matchMedia = ( query ) =>
				real( /display-mode:\s*standalone/.test( query ) ? 'all' : query );
		} );
		const item = await newWindow( installed );
		const post = await item.getAttribute( 'href' );
		// Pressed, the post opens in a new window and the app stays where it was.
		const here = installed.url();
		const [ opened ] = await Promise.all( [ context.waitForEvent( 'page' ), item.click() ] );
		await expect( opened ).toHaveURL( post );
		expect( installed.url() ).toBe( here );
		await opened.close();
		await installed.close();
	} );
} );
