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
} );
